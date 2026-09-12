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
const evidence = option('evidence') || '/tmp/rr-sidebar-states';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sidebar-states-'));
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
        await driver.execute('I18n.setLanguage(arguments[0],{persist:false});reactor.optionsManager.applyTheme(arguments[1]);',[option('language')||'en',option('theme')||'dark']);
        if (option('size')) {
            const [width,height]=option('size').split('x').map(Number);
            await driver.execute('nw.Window.get().unmaximize();');
            await driver.sessionRequest('POST','/window/rect',{width,height});
            await driver.waitForScript('return innerWidth===arguments[0]&&innerHeight===arguments[1];',[width,height]);
        }
        const checks=[],failures=[];
        const check=(name,actual,expected=true)=>{checks.push(name);try{assert.deepEqual(actual,expected);}catch(_){failures.push({name,actual,expected});}};
        const pause=()=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,160);');
        const key=async value=>{await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value},{type:'pause',duration:70},{type:'keyUp',value}]}]});await pause();};
        const click=async selector=>{
            const p=await driver.execute('const e=document.querySelector(arguments[0]);e.scrollIntoView({block:"nearest"});const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};',[selector]);
            await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',origin:'viewport',duration:0,...p},{type:'pause',duration:80},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});await pause();
        };
        await driver.execute(`if(!reactor.eventManager.eventMode)reactor.toggleEventMode();const em=reactor.eventManager;em.currentMap.events=[null,...[1,3,9,12,20,25,31,36,40,45,50,55,60,65,70].map((id,i)=>({id,name:'Keyboard Event '+id,x:i%20,y:5,pages:[]}))];em.updateEventsList();`);
        await click('#events-list [data-event-id="1"]');
        check('event click focuses the list',await driver.execute('return document.activeElement.id;'),'events-list');
        await key('\uE015');
        check('Down selects next event across sparse IDs',await driver.execute('return reactor.eventManager.selectedEvent?.id;'),3);
        await key('\uE014');
        check('Right in the event list does not move the map selection',await driver.execute('return [reactor.eventManager.selectedTileX,reactor.eventManager.selectedTileY];'),[1,5]);
        await key('\uE010');
        check('End selects last event',await driver.execute('return reactor.eventManager.selectedEvent?.id;'),70);
        check('last event remains visible',await driver.execute('const l=document.getElementById("events-list"),r=l.querySelector(".selected")?.getBoundingClientRect(),b=l.getBoundingClientRect();return !!r&&r.top>=b.top&&r.bottom<=b.bottom;'));
        await key('\uE011');await key('\uE013');
        check('Home and Up stop at the first event',await driver.execute('return reactor.eventManager.selectedEvent?.id;'),1);
        await driver.execute('reactor.eventManager.updateEventsList();reactor.eventManager.updateEventsList();');
        await key('\uE015');
        check('rerendering does not duplicate key handlers',await driver.execute('return reactor.eventManager.selectedEvent?.id;'),3);
        await driver.execute('window.__editCalls=[];window.__editEvent=reactor.eventManager.editEvent;reactor.eventManager.editEvent=e=>__editCalls.push(e.id);');
        await key('\uE007');
        check('Enter opens the selected event once',await driver.execute('return __editCalls;'),[3]);
        await driver.execute('reactor.eventManager.editEvent=__editEvent;reactor.databaseEditorUI.openDatabase("states");reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);');
        await click('#database-list [data-entry-id="1"]');await key('\uE015');
        check('database arrows retain list focus',await driver.execute('return document.activeElement.id;'),'database-list');
        const focus=await driver.execute('const s=getComputedStyle(document.getElementById("database-list"));return {style:s.outlineStyle,color:s.outlineColor,offset:s.outlineOffset};');
        check('database list has no browser-default focus bar',focus.style,'none');
        const rowFocus=await driver.execute('const e=document.querySelector("#database-list .selected"),s=getComputedStyle(e);return {style:s.outlineStyle,offset:s.outlineOffset};');
        check('keyboard focus is shown inside the selected row',rowFocus,{style:'solid',offset:'-2px'});
        fs.writeFileSync(evidence+'-focus.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute(`const state=reactor.databaseManager.getState(2);Object.assign(state,{autoRemovalTiming:2,removeByDamage:true,removeByWalking:true});reactor.databaseEditorUI.showDatabaseDetail(state,'states');`);
        await pause();
        const layout=await driver.execute(`const rows=[...document.querySelectorAll('.state-duration-check-row')];return rows.map(row=>{const a=row.querySelector('input').getBoundingClientRect(),b=row.querySelector('span').getBoundingClientRect();return {gap:b.left-a.right,aligned:Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<3};});`);
        check('Duration checkboxes sit beside their labels',layout.every(r=>r.gap>=4&&r.gap<=12&&r.aligned));
        check('Duration numeric labels precede their controls',await driver.execute(`return [...document.querySelectorAll('.state-duration-row:not(.state-duration-check-row)')].every(row=>{const label=row.querySelector(':scope > span:first-child'),input=row.querySelector('.rr-shim-wrapper')||row.querySelector('input,select');return label&&label.getBoundingClientRect().left<input.getBoundingClientRect().left;});`));
        await click('.state-duration-check-row input[data-field="removeByDamage"]');
        check('damage option hides its dependent field',await driver.execute('return getComputedStyle(document.getElementById("state-chance-row-2")).display;'),'none');
        await click('.state-duration-check-row input[data-field="removeByDamage"]');
        check('damage option reveals its dependent field',await driver.execute('return getComputedStyle(document.getElementById("state-chance-row-2")).display;'),'grid');
        check('Duration panel fits its shared row',await driver.execute('const e=document.querySelector(".state-duration-section");return e.getBoundingClientRect().width<=e.parentElement.getBoundingClientRect().width;'));
        await driver.execute(`document.querySelector('.state-duration-row input[data-field="minTurns"]').focus();`);
        await key('\uE004');
        check('Tab advances from minimum to maximum turns',await driver.execute('return document.activeElement.dataset.field;'),'maxTurns');
        await key('\uE015');
        check('numeric field arrows do not navigate database records',await driver.execute('return reactor.databaseEditorUI._activeDatabaseList.focusedId;'),2);
        fs.writeFileSync(evidence+'-states.png' ,Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        const positions = () => driver.execute(`const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};return {general:rect('.state-general-section'),traits:rect('.state-traits-section'),messages:rect('.state-messages-section'),pair:rect('.state-duration-notes'),duration:rect('.state-duration-section'),note:rect('.state-note-section'),grid:rect('.database-state-grid')};`);
        const cards=await positions();
        check('Traits shares the top row with General',Math.abs(cards.general.y-cards.traits.y)<1&&cards.traits.x>cards.general.right);
        check('Messages and Duration/Notes occupy the second row',Math.abs(cards.messages.y-cards.pair.y)<1&&cards.messages.y>cards.general.y);
        check('Duration and Notes wrap only when their shared space is narrow',cards.pair.width>=576?Math.abs(cards.duration.y-cards.note.y)<1:cards.note.y>=cards.duration.bottom);
        await click('.state-traits-section .trait-row');
        check('trait selection still enables Edit',await driver.execute('return !document.querySelector(".state-traits-section .trait-btn-edit").disabled;'));
        check('trait marker has no protruding border',await driver.execute('return getComputedStyle(document.querySelector(".state-traits-section .trait-indicator")).borderLeftWidth;'),'0px');
        check('trait content aligns with its heading',await driver.execute('const t=document.querySelector(".state-traits-section table"),h=t.querySelector("th:nth-child(2)").getBoundingClientRect(),c=t.querySelector("td:nth-child(2)").getBoundingClientRect();return Math.abs(h.left-c.left)<1&&Math.abs(h.right-c.right)<1&&Math.abs(c.left-t.getBoundingClientRect().left)<1;'));
        fs.writeFileSync(evidence+'-layout.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute('document.querySelector(".database-window").style.width="1000px";');await pause();
        const narrow=await positions();
        check('narrow States view stacks the main cards',Math.abs(narrow.general.x-narrow.traits.x)<1&&narrow.traits.y>=narrow.general.bottom&&narrow.messages.y>=narrow.traits.bottom);
        check('narrow Duration/Notes cards fit within the detail pane',[narrow.duration,narrow.note].every(r=>r.x>=narrow.grid.x-1&&r.right<=narrow.grid.right+1));
        await driver.execute('document.querySelector(".state-duration-section").scrollIntoView({block:"start"});');
        fs.writeFileSync(evidence+'-narrow.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        check('no captured application errors',await driver.execute('return __interactionErrors;'),[]);
        const result={checks,failures,focus,layout,cards,narrow,language:option('language')||'en',theme:option('theme')||'dark',viewport:await driver.execute('return [innerWidth,innerHeight];')};fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
        if(!process.argv.includes('--probe'))assert.deepEqual(failures,[]);
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
