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
const evidence = option('evidence') || '/tmp/rr-event-double-click';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-event-double-click-'));
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
        await driver.execute(`
            const em=reactor.eventManager;
            window.__mapEvent=JSON.parse(JSON.stringify(em.currentMap.events.find(Boolean)||{
                id:1,name:'Double-click fixture',x:5,y:5,pages:[{
                    conditions:{},image:{characterName:'',characterIndex:0,direction:2,pattern:1,tileId:0},
                    moveType:0,moveSpeed:3,moveFrequency:3,moveRoute:{list:[{code:0}],repeat:true,skippable:false,wait:false},
                    walkAnime:true,stepAnime:false,directionFix:false,through:false,priorityType:1,trigger:0,list:[{code:0,indent:0,parameters:[]}]
                }]
            }));
            em.currentMap.events=[null,__mapEvent];em.renderEvents();
            if(!em.eventMode)reactor.toggleEventMode();
            window.__opens=[];const edit=em.editEvent.bind(em);em.editEvent=(e,...args)=>{__opens.push(e.id);return edit(e,...args);};
        `);
        const point=await driver.execute(`
            const em=reactor.eventManager,tm=em.tilemapManager;
            const p=tm.container.toGlobal({x:(__mapEvent.x+0.5)*tm.TILE_WIDTH,y:(__mapEvent.y+0.5)*tm.TILE_HEIGHT});
            const r=tm.app.canvas.getBoundingClientRect();return {x:Math.round(r.x+p.x),y:Math.round(r.y+p.y)};
        `);
        console.log('Point',point);
        await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[
            {type:'pointerMove',x:point.x,y:point.y,duration:50},
            {type:'pointerDown',button:0},{type:'pointerUp',button:0},{type:'pause',duration:100},
            {type:'pointerDown',button:0},{type:'pointerUp',button:0}
        ]}]});
        await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,300);');
        const state=await driver.execute(`return {opens:__opens,eventMode:reactor.eventManager.eventMode,modal:getComputedStyle(document.getElementById('event-editor-modal')).display,errors:__interactionErrors};`);
        console.log(JSON.stringify(state,null,2));assert.deepEqual(state.opens,[1]);assert.notEqual(state.modal,'none');assert.deepEqual(state.errors,[]);
        await driver.execute('reactor.eventManager.eventEditor.cancelChanges();__opens=[];');
        const enabled=await driver.executeAsync(`const done=arguments[arguments.length-1];reactor.mapEditor3D.setEnabled(true).then(done,e=>done({error:String(e.stack)}));`);
        assert.equal(enabled,true,JSON.stringify(enabled));
        await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,600);');
        const point3d=await driver.execute(`
            const view=reactor.mapEditor3D;
            const mesh=view.pickables.find(m=>m.userData.event?.id===1);
            if(!mesh)throw Error('Event mesh missing');
            const p=mesh.getWorldPosition(new THREE.Vector3()).project(view.camera),r=view.canvas.getBoundingClientRect();
            const x=Math.round(r.x+(p.x+1)*r.width/2),y=Math.round(r.y+(1-p.y)*r.height/2);
            return {x,y,picked:view.eventAt(x,y)?.userData.event?.id};
        `);
        console.log('3D point',point3d);assert.equal(point3d.picked,1);
        await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[
            {type:'pointerMove',x:point3d.x,y:point3d.y,duration:50},
            {type:'pointerDown',button:0},{type:'pointerUp',button:0},{type:'pause',duration:100},
            {type:'pointerDown',button:0},{type:'pointerUp',button:0}
        ]}]});
        const state3d=await driver.execute(`return {opens:__opens,modal:getComputedStyle(document.getElementById('event-editor-modal')).display,errors:__interactionErrors};`);
        console.log(JSON.stringify(state3d,null,2));assert.deepEqual(state3d.opens,[1]);assert.notEqual(state3d.modal,'none');assert.deepEqual(state3d.errors,[]);
    } finally {
        await driver.close();fs.rmSync(temp,{recursive:true,force:true});
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
