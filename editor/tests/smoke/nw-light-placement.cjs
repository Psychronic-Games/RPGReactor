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
    const resultLights=await driver.executeAsync(`
        const done=arguments[arguments.length-1];
        (async()=>{
            const app=reactor,pc=app.projectController,lights=app.lightingManager,view=app.mapEditor3D;
            const tick=()=>new Promise(r=>setTimeout(r,150)),check=(v,m)=>{if(!v)throw Error(m);};
            await view.setEnabled(true);lights.setActive(true);await tick();
            const count=lights.lights().length;check(!lights.placing,'opening Lights does not arm a hidden light');
            const chip=lights._addButtons.neon,box=chip.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
            const pointer=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,button:0,pointerId:1,clientX:x,clientY:y}));
            pointer(chip,'pointerdown',x,y);pointer(window,'pointermove',x+8,y);pointer(window,'pointerup',x+8,y);
            check(lights.lights().length===count,'small drag released on panel creates no hidden light');
            check(!lights.placing,'cancelled drop clears placement');
            chip.click();check(lights.placing&&lights.lights().length===count,'choosing a preset only arms it');
            check(lights._statusHost.textContent.includes('Neon'),'placement status names selected type');
            const rect=view.canvas.getBoundingClientRect();const px=rect.left+rect.width*.35,py=rect.top+rect.height*.5;
            check(lights._tileFromClient(px,py),'exposed viewport is a valid drop target');
            pointer(view.inputSurface||view.canvas,'pointerdown',px,py);pointer(view.inputSurface||view.canvas,'pointerup',px,py);
            check(lights.lights().length===count+1&&!lights.placing,'map click places exactly one light');
            const dragChip=lights._addButtons.spot,dragBox=dragChip.getBoundingClientRect();
            pointer(dragChip,'pointerdown',dragBox.x+dragBox.width/2,dragBox.y+dragBox.height/2);
            pointer(window,'pointermove',px+30,py);pointer(window,'pointerup',px+30,py);
            check(lights.lights().length===count+2&&!lights.placing,'drag onto exposed map places exactly one light');
            chip.click();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            check(!lights.placing&&lights._armedKey===null,'Escape fully clears pending type');
            const controls=lights._ambientControls;controls.level.value='31';controls.level.dispatchEvent(new Event('input',{bubbles:true}));
            check(lights.ambient().ambient===.31,'slider edits stored ambient');
            const day=[...lights._panel.querySelectorAll('button')].find(b=>b.textContent==='Day');day.click();
            check(controls.level.value==='100'&&controls.readout.textContent==='100%'&&controls.level.style.getPropertyValue('--rr-fill')==='100.0%','Day updates value, readout and fill');
            check(getComputedStyle(controls.level).borderTopWidth==='0px','ambient range has no outer box');
            controls.level.value='37';controls.level.dispatchEvent(new Event('input',{bubbles:true}));lights._setAmbient({ambientColour:'#c0d0e0'});
            const oldId=pc.tilemapManager.currentMap.id;check(await pc.saveProject(),'save ambient');
            await pc.loadMap(oldId,{forceReload:true,skipDirtyCheck:true});await tick();
            check(lights.ambient().ambient===.37&&lights.ambient().ambientColour==='#c0d0e0','map reopen retains brightness and colour');
            check(lights._ambientControls.readout.textContent==='37%'&&lights._ambientControls.level.style.getPropertyValue('--rr-fill')==='37.0%','reopened map controls match saved state');
            const newId=pc.getNextAvailableMapId();pc.createNewMap();await pc.saveMapProperties();document.getElementById('map-properties-cancel-btn').click();
            check(!!pc.currentProject.maps[newId],'new map created');
            await pc.loadMap(newId,{skipDirtyCheck:true});await tick();
            check(pc.tilemapManager.currentMap.reactor3d?.lighting?.ambient===undefined,'new 2D map writes no ambient (unlit, drawn in daylight)');
            check(Reactor3D.ambientFor(pc.tilemapManager.currentMap).intensity===1,'runtime reads the same Day setting');
            await pc.loadMap(oldId,{skipDirtyCheck:true});await tick();
            check(lights.ambient().ambient===.37,'new map did not overwrite old ambient');
            await view.setEnabled(true);await new Promise(r=>setTimeout(r,1500));
            check(lights._ambientControls.readout.textContent==='37%'&&lights._ambientControls.level.style.getPropertyValue('--rr-fill')==='37.0%','3D panel refreshes after changing maps');
            check(lights._panel.querySelectorAll('.lit-list-row').length===lights.lights().length,'3D panel lists current map lights');
            lights._panel.scrollTop=0;
            return {oldId,newId,placed:count+2,icons:lights._panel.querySelectorAll('.lit-chip svg').length};
        })().then(done,e=>done({error:String(e.stack)}));
    `);
    assert.ok(!resultLights.error,JSON.stringify(resultLights));assert.equal(resultLights.icons,12);
    const oldLighting=JSON.parse(fs.readFileSync(path.join(project,'data', 'Map'+String(resultLights.oldId).padStart(3,'0')+'.r3d.json'))).lighting;
    assert.equal(oldLighting.ambient,.37);assert.equal(oldLighting.ambientColour,'#c0d0e0');
    // A new 2D map writes no sidecar (0.99.1); if one exists, it carries no ambient.
    const newSidecar=path.join(project,'data', 'Map'+String(resultLights.newId).padStart(3,'0')+'.r3d.json');
    assert.equal(fs.existsSync(newSidecar)?JSON.parse(fs.readFileSync(newSidecar)).lighting?.ambient:undefined,undefined);
    fs.writeFileSync('/tmp/rr-light-placement.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    console.log('Light placement, ambient controls, persistence and Day defaults passed:',resultLights);
} catch(error) {
    try { console.log(await driver.execute('return {preview:!!__props?.panel?.querySelector("#model-props-preview img"),token:__props?._previewToken,model:__props?.model,panel:__props?.panel?.getBoundingClientRect().toJSON()};'));fs.writeFileSync('/tmp/rr-compact-layout.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));}catch(_){}
    throw error;
} finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
