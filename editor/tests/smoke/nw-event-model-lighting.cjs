const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-event-model-lighting-')),project=path.join(temp,'Demo');
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
            const em=app.eventManager,map=manager.currentMap,id=101;
            const event={id,name:'Lit model event',x:prop.x+2,y:prop.y,pages:[{image:{characterName:'',direction:2,pattern:1,tileId:0}}]};
            map.events[id]=event;map.reactor3d.events=map.reactor3d.events||{};
            map.reactor3d.events[id]={0:ModelPropsManager.specOf(prop)};
            map.reactor3d.eventPreviews=map.reactor3d.eventPreviews||{};map.reactor3d.eventPreviews[id]=0;
            window.__litEvent=event;em.renderEventPreviews();
            return {id:-id,name:prop.name};
        })().then(done,e=>done({error:String(e.stack)}));
    `,[project]);assert.ok(result.id,JSON.stringify(result));
    await driver.waitForScript("return getComputedStyle(document.getElementById('splash-screen')).display==='none';",[],{timeout:15000});
    await driver.waitForScript('const img=__props.panel.querySelector("#model-props-preview img");return img?.complete && img.naturalWidth>0;',[],{timeout:30000});
    await driver.execute('reactor.mapEditor3D.setEnabled(false); __props.select(null);');
    await driver.waitForScript('return !!__props.preview2D.entries.get(arguments[0])?.lighting;', [result.id], {timeout:60000});
    const pixels=await driver.executeAsync(`
        const id=arguments[0],done=arguments[arguments.length-1];
        (async()=>{
            const preview=__props.preview2D,entry=preview.entries.get(id),R=Reactor3D;
            await RREventPreviewModels.whenTexturesDecoded?.(entry.object);
            preview.app.ticker.remove(preview._tick,preview);
            entry.media?.suspend();
            const viewport=preview.ensureViewport(),renderer=viewport.renderer();
            const get=()=>{preview.paint(entry);const p=new Uint8Array(entry.size*entry.size*4);renderer.readRenderTargetPixels(entry.target,0,0,entry.size,entry.size,p);return p;};
            const ambient={intensity:0.1,colour:0xffffff};
            // The actual reactor, lit in its own world space. This elevated
            // light cannot reach the floor, but must illuminate its surfaces.
            const p=entry.prop;
            const light={id:'surface-fixture',type:'point',x:p.x,y:p.y+3,height:10,radius:8,colour:0xff0055,intensity:3};
            preview.syncLighting(entry,[],ambient);const dark=get();
            preview.syncLighting(entry,[light],ambient);const lit=get();
            let changed=0,gain=0,alphaChanged=0;
            for(let i=0;i<lit.length;i+=4){if(lit[i+3]!==dark[i+3])alphaChanged++;if(lit[i]>dark[i]+2)changed++;gain+=lit[i]-dark[i];}
            // Compare against the same mesh/camera translated into map world
            // coordinates, using the ordinary 3D light packing convention.
            const origin=new THREE.Vector3(p.x+0.5,p.z||0,p.y+0.5);
            entry.object.position.add(origin);entry.camera.position.add(origin);
            entry.camera.updateMatrixWorld(true);
            R.packLightUniforms([light],ambient,entry.lighting);
            viewport.renderInto(entry.target,entry.scene,entry.camera);
            const reference=new Uint8Array(lit.length);renderer.readRenderTargetPixels(entry.target,0,0,entry.size,entry.size,reference);
            let error=0;for(let i=0;i<lit.length;i++)error+=Math.abs(lit[i]-reference[i]);
            const referenceMeanError=error/lit.length;
            entry.object.position.sub(origin);entry.camera.position.sub(origin);entry.camera.updateMatrixWorld(true);
            entry.lightingKey=null;preview.syncLighting(entry,[light],ambient);
            // Another renderer's uniforms cannot corrupt this retained model.
            R.packLightUniforms([],{intensity:0});const isolated=get();
            const isolation=isolated.every((v,i)=>v===lit[i]);
            const field=entry.lighting.rrLightCount.value;
            preview.syncLighting(entry,[],ambient);const reset=get();
            const restores=reset.every((v,i)=>v===dark[i]);
            const tint=__props.previewTint(id);
            // Save actual texture images for review without writing project data.
            for(const [name,values] of [['dark',dark],['lit',lit]]){
                const canvas=document.createElement('canvas');canvas.width=canvas.height=entry.size;
                canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(values),entry.size,entry.size),0,0);
                require('fs').writeFileSync('/tmp/rr-event-model-'+name+'.png',Buffer.from(canvas.toDataURL().split(',')[1],'base64'));
            }
            return {changed,gain,alphaChanged,isolation,restores,field,tint,referenceMeanError,size:entry.size,floor:FlatLightField2D.bounds(light,__props.currentMap)};
        })().then(done,e=>done({error:String(e.stack)}));
    `,[result.id]);
    console.log(JSON.stringify(pixels,null,2));assert.equal(pixels.error,undefined);
    assert.ok(pixels.changed>100,'a nearby light illuminates actual reactor pixels');assert.ok(pixels.gain>1000);
    assert.equal(pixels.alphaChanged,0);assert.equal(pixels.isolation,true);assert.equal(pixels.restores,true);
    assert.ok(pixels.referenceMeanError<0.05,'flat/world light pixels agree');
    assert.equal(pixels.field,1);assert.equal(pixels.tint,0xffffff);assert.equal(pixels.floor,null);
    const lifecycle=await driver.execute(`const preview=__props.preview2D,id=arguments[0],entry=preview.entries.get(id),em=reactor.eventManager;
        __litEvent.x+=1;em.renderEventPreviews();const retained=preview.entries.get(id)===entry&&entry.prop.x===__litEvent.x;
        const count=__props.props().length;em.setEventPreview(__litEvent,null);
        const removed=!preview.entries.has(id)&&!__props._sprites.has(id)&&entry.sprite.destroyed;
        const authoredUnchanged=count===__props.props().length&&__props.props().every(p=>p.id>0);
        return {retained,removed,authoredUnchanged};`,[result.id]);
    assert.deepEqual(lifecycle,{retained:true,removed:true,authoredUnchanged:true});
    fs.writeFileSync('/tmp/rr-event-model-lighting-result.json',JSON.stringify({pixels,lifecycle},null,2));
    console.log('Event model lighting passed: actual reactor surface response, no floor footprint required, isolated uniforms, reset and single ambient application.');
}finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
