// Multiple authored effects must remain visible in the real model viewport.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'), source=path.join(root,'template/Demo');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-model-effects-')), project=path.join(temp,'Demo');
const driver=new WebDriverClient(path.join(process.env.NWJS_SDK_ROOT||path.join(root,'nwjs-linux'),'chromedriver'));
(async()=>{
 try {
    fs.mkdirSync(project);
    for(const name of ['project.rpgreactor','package.json','index.html']) fs.copyFileSync(path.join(source,name),path.join(project,name));
    fs.cpSync(path.join(source,'data'),path.join(project,'data'),{recursive:true});
    for(const name of ['js','img','effects','audio','fonts','css','icon']) if(fs.existsSync(path.join(source,name))) fs.symlinkSync(path.join(source,name),path.join(project,name));
    const model='3d/Map-Objects/RPGReactor';fs.mkdirSync(path.join(project,model),{recursive:true});
    fs.copyFileSync(path.join(source,model,'model.json'),path.join(project,model,'model.json'));
    fs.symlinkSync(path.join(source,model,'source'),path.join(project,model,'source'));
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run']}});
    await driver.setScriptTimeout(60000);
    await driver.waitForScript('return !!window.reactor?.databaseEditorUI && window._effekseerReady;',[],{timeout:90000});
    const opened=await driver.executeAsync(`
        const projectPath=arguments[0],done=arguments[arguments.length-1];
        (async()=>{
            const app=reactor,p=await app.projectManager.loadProject(projectPath);
            await app.databaseManager.loadAllData(projectPath);
            app.projectController.currentProject=p;app.projectController.projectLoaded=true;
            app.openDatabase('reactor3d');nw.Window.get().resizeTo(1920,1080);
            window.__modelEditor=app.databaseEditorUI.reactor3dEditor;
            return true;
        })().then(done,e=>done({error:String(e.stack)}));
    `,[project]);assert.equal(opened,true);
    await driver.waitForScript('return __modelEditor._object && !__modelEditor._loadingPreview && __modelEditor._fxPreview?.active && __modelEditor._additionalEffectPreviews?.size===1;',[],{timeout:60000});
    await driver.waitForScript("return getComputedStyle(document.getElementById('splash-screen')).display === 'none';",[],{timeout:15000});
    const visible=await driver.executeAsync(`
        const done=arguments[arguments.length-1];
        const start=performance.now(), seen=new Set();
        const sample=()=>{
            const layers=[__modelEditor,...__modelEditor._additionalEffectPreviews.values()];
            layers.forEach((p,i)=>{
                const layer=p._fxPreview;if(!layer?.active)return;
                layer.drawNow?.();
                let pixels;
                if(layer.fx.gpu&&layer._gpuColourTarget){
                    // GPU overlays render to retained targets, not the fallback canvas.
                    const target=layer._gpuColourTarget;
                    pixels=new Uint8Array(target.width*target.height*4);
                    __modelEditor._renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
                }else{
                    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
                    const c=canvas.getContext('2d');c.drawImage(layer.fxCanvas,0,0,96,96);
                    pixels=c.getImageData(0,0,96,96).data;
                }
                if(pixels.some((v,index)=>index%4===3 && v>5))seen.add(i);
            });
            if(seen.size===2)return done({seen:seen.size,names:layers.map(p=>p._fxPreviewDef.name)});
            if(performance.now()-start>15000)return done({seen:seen.size});
            setTimeout(sample,100);
        };sample();
    `);assert.equal(visible.seen,2,JSON.stringify(visible));console.log('Both Reactor effects visible:',visible.names);
    fs.writeFileSync('/tmp/rr-model-effects.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    const changed=await driver.execute(`
        const e=__modelEditor,index=e.rawEffects.findIndex(r=>r.name==='Core (2)');
        e.selectEffect(index);e._effectWork.anchor.offset[0]+=0.2;e._updateTriggeredEffectPreview();e._updateEffectPreview();
        const p=e._additionalEffectPreviews.get(index);
        const result=p._fxPreviewDef===e._effectWork && !!p._fxQuad?.mesh.visible;
        e._disposePreview();return {result,remaining:e._additionalEffectPreviews?.size||0};
    `);assert.equal(changed.result,true);assert.equal(changed.remaining,0);
    console.log('Working anchor follows the copied effect; closing disposes its layer.');
 } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
