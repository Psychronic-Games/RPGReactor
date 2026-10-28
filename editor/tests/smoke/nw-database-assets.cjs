// Saved thumbnails, compound blueprints and shared toolbar layout in the real editor.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-database-assets-'));
const project=path.join(temp,'Project'),evidence=path.resolve(process.env.RR_ASSET_EVIDENCE||path.join(temp,'evidence'));
fs.mkdirSync(project);fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(path.join(project,'data'));fs.writeFileSync(path.join(project,'data/System.json'),'{}');
for(const name of ['Saved','Missing']){
    const folder=path.join(project,'3d','Actors',name);fs.mkdirSync(path.join(folder,'source'),{recursive:true});
    fs.copyFileSync(path.join(root,'template/Demo/3d/Actors/Rhea Voss/source/Rhea Voss.glb'),path.join(folder,'source',name+'.glb'));
    if(name==='Saved')fs.copyFileSync(path.join(root,'template/Demo/3d/Actors/Rhea Voss/thumbnail.png'),path.join(folder,'thumbnail.png'));
}
fs.cpSync(path.join(root,'template/Demo/3d/Structures'),path.join(project,'3d/Structures'),{recursive:true});
let driver;
async function run(script,...args){const r=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${script}})().then(done,e=>done({auditError:String(e.stack)}));`,args);assert.ok(!r?.auditError,r?.auditError);return r;}
async function shot(name){const png=await driver.sessionRequest('GET','/screenshot');fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(png,'base64'));}
(async()=>{try{
    driver=new WebDriverClient(path.join(process.env.NWJS_SDK_ROOT||path.join(root,'nwjs-linux'),'chromedriver'));
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run','js-flags=--max-old-space-size=1024']}});
    await driver.setScriptTimeout(120000);await driver.waitForScript('return !!window.reactor?.forgeManager;',[],{timeout:90000});
    await run(`
        window.__assetErrors=[];addEventListener('error',e=>__assetErrors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>__assetErrors.push(String(e.reason?.stack||e.reason)));
        const pc=reactor.projectController;pc.currentProject={path:arguments[0]};await pc.mapEditor3D.ensureLibraries();
        window.__assetHost=document.createElement('div');__assetHost.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(__assetHost);
        window.__models=new Database3DEditor(reactor.databaseManager,pc);
        // Isolate the persistent caches so this audit always exercises a genuinely missing image.
        __models._thumbnailCachePath=entry=>require('path').join(arguments[0],'cache',entry.file+'.png');
        window.__thumbRenders=[];const render=__models._renderThumbnail;
        __models._renderThumbnail=async function(entry){__thumbRenders.push(entry.name);return render.call(this,entry);};
        __models.show(__assetHost);
        const saved=__models._thumbRow('Actors/Saved');
        return {savedImmediate:!!saved?.style.backgroundImage};`,project).then(r=>assert.equal(r.savedImmediate,true));
    await driver.waitForScript(`return require('fs').existsSync(require('path').join(reactor.projectController.currentProject.path,'3d/Actors/Missing/thumbnail.png'));`,[],{timeout:90000});
    const thumbs=await run(`
        const savedBefore=require('fs').readFileSync(require('path').join(arguments[0],'3d/Actors/Saved/thumbnail.png')).toString('base64');
        await __models._thumbnailWork;const first=__thumbRenders.slice();__models._thumbs={};__thumbRenders=[];__models.renderModelList(true);await __models._thumbnailWork;
        const second=__thumbRenders.slice();__models._disposePreview();return {first,second,savedBefore};`,project);
    assert.deepEqual(thumbs.first,['Actors/Missing']);assert.deepEqual(thumbs.second,[]);
    assert.equal(thumbs.savedBefore,fs.readFileSync(path.join(root,'template/Demo/3d/Actors/Rhea Voss/thumbnail.png')).toString('base64'));
    const structures=await run(`
        __assetHost.innerHTML='';const fs=require('fs'),path=require('path'),pc=reactor.projectController;
        const records=fs.readdirSync(path.join(arguments[0],'3d/Structures')).filter(n=>n.endsWith('.json')).map((file,i)=>({id:i+1,file,name:file.slice(0,-5),plan:DatabaseStructureEditor.normalizePlan(JSON.parse(fs.readFileSync(path.join(arguments[0],'3d/Structures',file))))}));
        window.__structureDb={data:{structures:[null,...records]},getTilesets:()=>[]};window.__workshop=new StructureWorkshop({databaseManager:__structureDb});
        const resolve=name=>records.find(row=>row.file===name||row.file===name+'.json'||row.name===name)?.plan;
        const results=[];
        for(const name of ['Cottage','Lot-Cottage','Hamlet','Chapel']){
            const entry=records.find(row=>row.name===name);if(!entry)throw Error('Missing fixture '+name);
            const expected=RRStructurePlan.build(entry.plan,0,0,1,0,resolve),map=__workshop.plotMap(entry);
            results.push({name,preview:expected.length,workshop:RRMapElevation.pieces(map).length});
        }
        window.__structures=new DatabaseStructureEditor(__structureDb,pc,null,null);__structures.resolve=resolve;__structures.parentEditor={_markDatabaseMutation(){},refreshDatabaseListLabel(){}};
        __structures.showStructureDetail(__assetHost,records.find(row=>row.name==='Hamlet'));
        return results;`,project);
    for(const r of structures){assert.ok(r.preview>0,r.name);assert.equal(r.workshop,r.preview,r.name);}
    await driver.waitForScript('return __structures._preview?.meshes.some(m=>m.geometry.attributes.position.count>0);',[],{timeout:60000});
    const layouts=[];
    for(const [width,height] of [[1280,720],[1024,600]]){
        await driver.sessionRequest('POST','/window/rect',{width,height});
        layouts.push(await run(`
            await new Promise(r=>setTimeout(r,160));__structures.drawPaint();
            const canvas=__assetHost.querySelector('.rr-structures-paint'),hint=__assetHost.querySelector('.rr-structures-paint-hint'),tool=__assetHost.querySelector('.rr-build-slot[data-slot="wall"]');
            tool.click();const pressed=__assetHost.querySelector('.rr-build-slot[data-slot="wall"]');
            const a=canvas.getBoundingClientRect(),b=hint.getBoundingClientRect();
            return {width:innerWidth,height:innerHeight,canvasHeight:a.height,hintHeight:b.height,floorButtonHeight:__assetHost.querySelector('.rr-structures-floor').getBoundingClientRect().height,separate:a.bottom<=b.top+1,inView:b.bottom<=innerHeight+1,tool:__structures._paint.tool,pressed:pressed.getAttribute('aria-pressed')};`));
        await shot('structures-'+width);
    }
    for(const r of layouts){assert.ok(r.canvasHeight>100);assert.ok(r.hintHeight>10);assert.ok(r.floorButtonHeight>20);assert.equal(r.separate,true);assert.equal(r.inView,true);assert.equal(r.tool,'wall');assert.equal(r.pressed,'true');}
    const nested=await run(`
        const e=__structures,before=e._builtPieces(e.current.plan).length;e._ensureBuilt();
        const plan=e.current.plan,piece=plan.pieces.find(p=>p.kind==='wall'),picked=RRStructureFloors.selectAt(plan,0,piece.x,piece.y);
        e._sel=picked;const selected=picked.length;e.deleteSelection();
        return {before,after:e._builtPieces(plan).length,selected,parts:plan.parts.length};`);
    assert.ok(nested.selected>0);assert.ok(nested.after<nested.before);assert.equal(nested.parts,0);
    await run(`
        __structures.detach();__assetHost.innerHTML='';
        const manager={level:0,mode:'select',kind:'floor',activate(){},setMode(mode){this.mode=mode;},setKind(kind){this.kind=kind;this.mode='place';}};
        window.__bar=new BuildHotbar({pieceBuilderManager:manager});__bar.currentMap=()=>({note:'<3d>',reactor3d:{version:1}});__bar.renderPanel=()=>{};
        __bar.mount(__assetHost);__bar.visible=true;__bar.root.style.display='flex';__bar.render();
        window.__hintView={};MapEditor3D.prototype.createHint.call(__hintView,__assetHost);
        return true;`);
    const mapLayouts=[];
    for(const [width,height] of [[1280,720],[1024,600]]){
        await driver.sessionRequest('POST','/window/rect',{width,height});
        mapLayouts.push(await run(`
            await new Promise(r=>setTimeout(r,160));__bar.layout();
            __bar.root.querySelector('[data-slot="wall"]').click();
            const a=__bar.root.getBoundingClientRect(),b=__hintView.hint.getBoundingClientRect(),help=__bar.root.querySelector('.rr-build-hint');
            __hintView.hint.style.opacity=1;__hintView.hint.style.transition='none';
            return {width:innerWidth,height:innerHeight,separate:b.bottom<=a.top-4,inView:b.top>=0,keys:getComputedStyle(help.querySelector('.rr-build-keys')).display,help:getComputedStyle(help).display,kind:__bar.manager().kind};`));
        await shot('map-'+width);
    }
    for(const r of mapLayouts){assert.equal(r.separate,true);assert.equal(r.inView,true);assert.notEqual(r.keys,'none');assert.notEqual(r.help,'none');assert.equal(r.kind,'wall');}
    const errors=await driver.execute('return __assetErrors;');assert.deepEqual(errors,[]);
    const result={thumbnails:{first:thumbs.first,warm:thumbs.second},structures,layouts,nested,mapLayouts,errors};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
