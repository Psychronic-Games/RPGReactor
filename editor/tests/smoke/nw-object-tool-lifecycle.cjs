const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-props-quality-')),project=path.join(temp,'Demo');
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
(async()=>{try {
    fs.mkdirSync(project);
    for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,name),path.join(project,name));
    for(const name of ['data','js','icon'])fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true});
    for(const name of ['img','audio','fonts','3d','effects','css'])if(fs.existsSync(path.join(source,name)))fs.symlinkSync(path.join(source,name),path.join(project,name));
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run']}});
    await driver.setScriptTimeout(90000);
    await driver.waitForScript('return !!window.reactor?.projectController;',[],{timeout:90000});
    const result=await driver.executeAsync(`
        const projectPath=arguments[0],done=arguments[arguments.length-1];
        (async()=>{
            const app=reactor,pc=app.projectController;pc.currentProject=await app.projectManager.loadProject(projectPath);pc.projectLoaded=true;
            nw.Window.get().resizeTo(1600,1000);nw.Window.get().focus();await app.uiManager.showEditorUI();await pc.populateProjectUI();
            app.tilesetPaletteViewer.selectLayer('M');
            const manager=app.modelPropsManager;
            const prop=manager.props().find(p=>p.name.includes('RPGReactor'));
            if(!prop)throw Error('No Reactor prop on Demo map');manager.select(prop.id);
            window.__props=manager;
            return {id:prop.id,name:prop.name};
        })().then(done,e=>done({error:String(e.stack)}));
    `,[project]);assert.ok(result.id,JSON.stringify(result));
    await driver.waitForScript("return getComputedStyle(document.getElementById('splash-screen')).display==='none';",[],{timeout:15000});
    await driver.waitForScript('const img=__props.panel.querySelector("#model-props-preview img");return img?.complete && img.naturalWidth>0;',[],{timeout:30000});
    const outcome=await driver.executeAsync(`
        const done=arguments[arguments.length-1];
        (async()=>{
            const app=reactor,pc=app.projectController,m=app.modelPropsManager;
            const tick=()=>new Promise(r=>setTimeout(r,100));
            const check=(v,message)=>{if(!v)throw Error(message);};
            const selected=m.selectedId,sourceId=m.currentMap.id;
            const assertMode=()=>{check(m.active,'3D-M is active');check(!app.eventManager.eventMode,'Events inactive');check(!app.mapEditor.enabled,'tile painter inactive');check(m._listeners.every(([c])=>c===pc.tilemapManager.container),'listeners use current canvas');};
            for(let i=0;i<2;i++){
                app.toggleEventMode();check(!m.active&&app.eventManager.eventMode,'event mode owns input');
                // A drawing button (disableEventModeIfActive) returns to painting by design (main.js claimMapTool); then back to 3D-M.
                if(i===0){app.disableEventModeIfActive();check(app.mapEditor.enabled&&!m.active&&!app.eventManager.eventMode,'drawing button returns to painting');app.tilesetPaletteViewer.selectLayer('M');}else app.toggleEventMode();
                assertMode();
            }
            // Use the real copy/paste path with an in-app clipboard, preserving the desktop clipboard.
            let clipboard;ReactorClipboard.write=async(type,payload)=>{clipboard={type,payload};};ReactorClipboard.read=async()=>clipboard;
            const copyId=pc.getNextAvailableMapId();await pc.copyMap(sourceId);await pc.pasteMap();
            check(!!pc.currentProject.maps[copyId],'map pasted');
            await pc.loadMap(copyId,{skipDirtyCheck:true});await tick();assertMode();
            check(m.currentMap.id===copyId&&m.selectedId===null&&!m.drag,'new map clears old selection');
            app.toggleEventMode();await pc.loadMap(sourceId,{skipDirtyCheck:true});await tick();
            check(app.eventManager.eventMode&&!m.active,'map change preserves Events ownership');
            app.tilesetPaletteViewer.selectLayer('M');assertMode();
            app.tilesetPaletteViewer.selectLayer('A');check(app.mapEditor.enabled&&!m.active,'leaving 3D-M restores painting');
            app.tilesetPaletteViewer.selectLayer('M');assertMode();
            await pc.loadMap(copyId,{skipDirtyCheck:true});await tick();assertMode();
            await app.mapEditor3D.setEnabled(true);
            for(let i=0;i<100&&!app.mapEditor3D.propObject(selected);i++)await tick();
            const view=app.mapEditor3D,object=view.propObject(selected);check(object,'copied model rendered in 3D');
            const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(view.camera);
            const rect=view.canvas.getBoundingClientRect();let point=null;
            for(const dy of [0,-10,10,-25,25])for(const dx of [0,-10,10,-25,25]){
                const x=rect.left+(center.x+1)*rect.width/2+dx,y=rect.top+(1-center.y)*rect.height/2+dy;
                if(view.propAt(x,y)===selected){point={x,y};break;}
            }
            check(point,'model has a pickable screen position');
            const surface=view.inputSurface||view.canvas;
            surface.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:point.x,clientY:point.y,pointerId:1}));
            surface.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,clientX:point.x,clientY:point.y,pointerId:1}));
            check(m.selectedId===selected,'real 3D picking works after mode/map changes');
            let mapDeletes=0;pc.deleteMap=()=>{mapDeletes++;};
            const del=()=>{document.activeElement?.blur();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));};
            del();check(!m.prop(selected)&&mapDeletes===0,'Delete removes only selected prop');del();check(mapDeletes===0,'repeat Delete cannot delete map');
            app.mapEditor.undo();check(!!m.prop(selected),'prop deletion undoes');
            const lights=app.lightingManager;lights.setActive(true);
            lights.place('point',12,12);check(lights.selectedId,'light created and selected');const lightId=lights.selectedId;
            await tick();
            const groups=[...lights._panel.querySelectorAll('details.lit-group')];check(groups.length===4,'light properties have collapsible sections');
            groups.find(g=>g.dataset.lightSection==='position').open=true;await tick();
            lights._endGesture({x:13});await tick();
            check(lights._panel.querySelector('[data-light-section=position]').open,'editing preserves expanded section');
            check(lights._panel.querySelectorAll('details.lit-group[open]').length===1,'one property section open');
            window.__lightId=lightId;
            del();check(!lights.lights().some(l=>l.id===lightId)&&mapDeletes===0,'Delete removes only selected light');
            del();check(mapDeletes===0,'repeated light Delete cannot delete map');lights.undo();check(lights.lights().some(l=>l.id===lightId),'light deletion undoes');
            lights.select(lightId);await tick();lights._panel.scrollTop=lights._panel.scrollHeight;
            return {sourceId,copyId,mapDeletes,sections:groups.map(g=>g.dataset.lightSection)};
        })().then(done,e=>done({error:String(e.stack)}));
    `);
    assert.ok(!outcome.error,JSON.stringify(outcome));
    fs.writeFileSync('/tmp/rr-light-sections.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    console.log('Object tool lifecycle and delete checks passed:',outcome);
} catch(error) {
    try { console.log(await driver.execute('return {preview:!!__props?.panel?.querySelector("#model-props-preview img"),token:__props?._previewToken,model:__props?.model,panel:__props?.panel?.getBoundingClientRect().toJSON()};'));fs.writeFileSync('/tmp/rr-compact-layout.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));}catch(_){}
    throw error;
} finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
