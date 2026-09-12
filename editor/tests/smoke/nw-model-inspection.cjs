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
const evidence = option('evidence') || '/tmp/rr-ui-quality';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ui-quality-'));
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

        const results={checks:[],themes:[]};
        await driver.sessionRequest('POST','/window/rect',{width:1600,height:1000});
        await driver.execute(`reactor.databaseEditorUI.openDatabase('reactor3d');window.__inspection=reactor.databaseEditorUI.reactor3dEditor;`);
        await driver.executeAsync(`const done=arguments[arguments.length-1];const e=__inspection;const entry=e.listModels().find(m=>m.name.includes('RPGReactor'));if(!entry)return done({error:'Missing Reactor model'});e.selectModel(entry).then(()=>done(true),error=>done({error:String(error)}));`);
        await driver.waitForScript('return !!__inspection._object && !__inspection._loadingPreview;',[],{timeout:60000});
        const gpu=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            const e=__inspection,R=Reactor3D;
            // Keep adaptive geometry reduction from changing screenshots between themes.
            R.GeometryDetail.enabled=false;
            await Database3DEditor.whenTexturesDecoded(e._template.userData.glbTextures);
            cancelAnimationFrame(e._raf);e._stopEffectPreview();e.rawEffects=[];
            window.__capture=(renderer,scene,camera)=>{
                const target=new THREE.WebGLRenderTarget(192,192),saved=renderer.getRenderTarget(),background=scene.background;
                try {scene.background=null;renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Uint8Array(192*192*4);renderer.readRenderTargetPixels(target,0,0,192,192,pixels);return pixels;}
                finally {renderer.setRenderTarget(saved);scene.background=background;target.dispose();}
            };
            const capture=()=>__capture(e._renderer,e._scene,e._camera);
            R.packLightUniforms([],{intensity:1,colour:0xffffff});const neutral=capture();window.__neutralInspection=neutral;
            R.packLightUniforms([{type:'point',x:0,y:0,height:2,radius:10,colour:0xff0000,intensity:3}],{intensity:0.02,colour:0x0033ff});
            const dimMap=capture();
            const shared=R.lightUniforms(),before={ambient:Array.from(shared.rrAmbient.value),count:shared.rrLightCount.value};
            e._cardMode="effect";e._effectWork={type:"light"};e._lightPreviewLit(true);
            R.packLightUniforms([{type:'point',x:0,y:1,height:2,radius:8,colour:0xff0055,intensity:2}],{intensity:e.LIGHT_PREVIEW_AMBIENT,colour:0xffffff},e._previewLighting);
            const effect=capture();e._lightPreviewLit(false);const reset=capture();e._cardMode="part";e._effectWork=null;
            const after={ambient:Array.from(shared.rrAmbient.value),count:shared.rrLightCount.value};
            let visible=0,changed=0;for(let i=0;i<neutral.length;i+=4){if(neutral[i+3]>10)visible++;if(neutral[i]!==effect[i]||neutral[i+1]!==effect[i+1]||neutral[i+2]!==effect[i+2])changed++;}
            window.__inspectionSpec={...e.listModels().find(m=>m.name===e.selectedName)};
            return {visible,changed,mapIndependent:neutral.every((v,i)=>v===dimMap[i]),reset:neutral.every((v,i)=>v===reset[i]),before,after};
        })().then(done,error=>done({error:String(error.stack)}));`);
        assert.equal(gpu.error,undefined,JSON.stringify(gpu));assert.ok(gpu.visible>100);assert.ok(gpu.changed>100);
        assert.equal(gpu.mapIndependent,true);assert.equal(gpu.reset,true);assert.deepEqual(gpu.after,gpu.before);results.gpu=gpu;console.log(JSON.stringify(gpu));
        results.checks.push('Database model pixels independent of map ambient and point lights','Effect lighting changes model pixels and resets to neutral','Effect inspection leaves current map uniforms untouched');
        // Resource preview uses the same material isolation but owns a separate renderer.
        const resource=await driver.execute(`const canvas=document.createElement('canvas');canvas.style.cssText='width:200px;height:200px;position:fixed;left:0;top:0;';document.body.append(canvas);const p=new ModelPreview3D(canvas);p.replaceTemplate(Reactor3D.cloneModelTemplate(__inspection._template));cancelAnimationFrame(p.raf);p.renderer.setSize(200,200,false);Reactor3D.aimCamera(p.camera,{x:-.5,y:0,z:-.5},p.view);Reactor3D.packLightUniforms([],{intensity:1});const a=__capture(p.renderer,p.scene,p.camera);Reactor3D.packLightUniforms([],{intensity:0});const b=__capture(p.renderer,p.scene,p.camera);const same=a.every((v,i)=>v===b[i]);window.__resourceInspection=p;return same;`);
        assert.equal(resource,true);results.checks.push('Resource preview remains neutral under a black map ambient');
        for(const palette of ['', 'bubblegum-', 'ocean-', 'cascadia-', 'underworld-', 'creamsicle-', 'royalty-'])for(const mode of ['dark','light']){
            const theme=palette+mode;
            await driver.execute(`reactor.optionsManager.applyTheme(arguments[0]);ModelPreview3D.updateBackground(__inspection._scene);Reactor3D.renderScene(__inspection._renderer,__inspection._scene,__inspection._camera);`,[theme]);
            await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,220);');
            const row=await driver.execute(`const e=__inspection,badge=document.querySelector('.rr-model-cost-badge'),style=getComputedStyle(badge);const rgba=color=>color.match(/[0-9.]+/g).slice(0,3).map(Number);const lum=color=>rgba(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const c=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);const badges=[];for(const kind of ['light','warning','heavy']){badge.dataset.cost=kind;const s=getComputedStyle(badge);badges.push({kind,ratio:c(s.color,s.backgroundColor)});}e.renderModelStats();const header=document.querySelector('.r3d-stats-card .sidebar-header'),h=getComputedStyle(header);return {background:e._scene.background.getHexString(),badges,headerContrast:c(h.color,h.backgroundColor),scrollbars:['events-list','maps-list','quick-access-list','tileset-preview-container'].map(id=>({id,color:getComputedStyle(document.getElementById(id)).scrollbarColor}))};`);
            row.modelStable=await driver.execute('const e=__inspection,p=__capture(e._renderer,e._scene,e._camera);return p.every((v,i)=>v===__neutralInspection[i]);');
            assert.equal(row.modelStable,true,theme+' preserves model pixels');
            row.theme=theme;results.themes.push(row);
            assert.equal(row.background,mode==='light'?'e5e7eb':'1a1a1e');assert.ok(row.badges.every(b=>b.ratio>=4.5));
            assert.ok(row.headerContrast>=4.5,theme+' section header');
            await driver.executeAsync('const done=arguments[arguments.length-1];let frames=3;const paint=()=>{Reactor3D.renderScene(__inspection._renderer,__inspection._scene,__inspection._camera);if(--frames)requestAnimationFrame(paint);else requestAnimationFrame(()=>done(true));};requestAnimationFrame(paint);');
            if(!palette)fs.writeFileSync(evidence+'-'+mode+'-model.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        }
        const thumbnail=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const e=__inspection,entry=__inspectionSpec;e._loadingPreview=false;e._lastInputAt=0;e._pointerMovedAt=0;Reactor3D.packLightUniforms([],{intensity:1});const a=await e._renderThumbnail(entry);Reactor3D.packLightUniforms([],{intensity:0});const b=await e._renderThumbnail(entry);return {equal:a===b,present:!!a};})().then(done,error=>done({error:String(error.stack)}));`);
        assert.deepEqual(thumbnail,{equal:true,present:true});results.checks.push('Database and inspector thumbnails are independent of map ambient');
        await driver.execute(`document.querySelector('#database-cancel-btn').click();window.__picker=new ModelGraphicPicker(reactor.projectController);__picker.show(__inspectionSpec,()=>{});`);
        await driver.waitForScript('return !!__picker._object && !!__picker._renderer;',[],{timeout:60000});
        const picker=await driver.execute(`cancelAnimationFrame(__picker._raf);const p=__picker;Reactor3D.packLightUniforms([],{intensity:1});const a=__capture(p._renderer,p._scene,p._camera);Reactor3D.packLightUniforms([],{intensity:0});const b=__capture(p._renderer,p._scene,p._camera);const same=a.every((v,i)=>v===b[i]);p._close();return same;`);
        assert.equal(picker,true);results.checks.push('Model picker remains neutral under a black map ambient');
        const eventPreview=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:0;top:0;width:200px;height:200px';document.body.append(canvas);const e=new EventPageEditor(reactor.databaseManager,reactor.projectController,{});await e._renderModelPreview(canvas,__inspectionSpec,{image:{direction:2}});if(!e._modelPreviewRenderer)throw Error('Event model preview did not load');cancelAnimationFrame(e._modelPreviewRaf);const r=e._modelPreviewRenderer,s=e._modelPreviewScene,c=e._modelPreviewCamera;r.setSize(200,200,false);Reactor3D.aimCamera(c,{x:-.5,y:0,z:-.5},{yaw:0,pitch:12,distance:2.4});Reactor3D.packLightUniforms([],{intensity:1});const a=__capture(r,s,c);Reactor3D.packLightUniforms([],{intensity:0});const b=__capture(r,s,c);const equal=a.every((v,i)=>v===b[i]);e._disposeModelPreview();canvas.remove();return equal;})().then(done,error=>done({error:String(error.stack)}));`);
        assert.equal(eventPreview,true,JSON.stringify(eventPreview));results.checks.push('Event page model inspection is independent of map ambient');
        // Palette transparency uses the original alternating preview squares.
        const background=await driver.execute(`const p=reactor.tilesetPaletteViewer,canvas=document.createElement('canvas');canvas.width=canvas.height=32;const c=canvas.getContext('2d');p.drawCheckerboard(c,32,32);const d=c.getImageData(0,0,32,32).data;return [0,1,2].some(i=>d[i]!==d[8*4+i]) && [0,1,2,3].every(i=>d[i]===d[(8*32+8)*4+i]);`);
        assert.equal(background,true);results.checks.push('Tileset transparency retains the original alternating squares');
        await driver.execute('const canvas=__resourceInspection.canvas;__resourceInspection.dispose();canvas.remove();');
        results.errors=await driver.execute('return __interactionErrors;');assert.deepEqual(results.errors,[]);
        fs.writeFileSync(evidence+'-result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
