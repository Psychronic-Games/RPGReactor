#!/usr/bin/env node
/** Four native Forge cases: creator handoff, garment controls, exports, reopening and GPU skinning. */
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||path.join(root,'scratchpad/forge-wearables-hair-20261029/wearables'));
fs.mkdirSync(out,{recursive:true});
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')||['shirt','jeans','boots','reconArmor'];assert.ok(ids.length<=4);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-wearables-')),project=path.join(temp,'Project');
fs.mkdirSync(path.join(project,'data'),{recursive:true});fs.writeFileSync(path.join(project,'data/System.json'),'{}');
const {PNG}=require('../../node_modules/pngjs');const badge=new PNG({width:16,height:16});for(let p=0;p<256;p++)badge.data.set([235,180,55,255],p*4);fs.mkdirSync(path.join(project,'img/pictures'),{recursive:true});fs.writeFileSync(path.join(project,'img/pictures/Badge.png'),PNG.sync.write(badge));
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
async function run(code,args=[]){const r=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${code}})().then(done,e=>done({error:String(e.stack)}));`,args);assert.ok(!r?.error,r?.error);return r;}
(async()=>{try {
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${root}/editor`,`user-data-dir=${temp}/profile`,'no-first-run','js-flags=--max-old-space-size=1024']}});
    await driver.setScriptTimeout(180000);await driver.waitForScript('return !!window.reactor?.forgeManager;',[],{timeout:90000});
    await run(`const pc=reactor.projectController;pc.currentProject={path:arguments[0]};await pc.mapEditor3D.ensureLibraries();
        window.__wearErrors=[];window.__wearLayoutNotices=[];addEventListener('error',e=>{if(e.message==='ResizeObserver loop completed with undelivered notifications.')__wearLayoutNotices.push(e.message);else __wearErrors.push(String(e.error?.stack||e.message));});addEventListener('unhandledrejection',e=>__wearErrors.push(String(e.reason?.stack||e.reason)));
        Character3DBuilder.weakGpu=()=>false;const manager=reactor.forgeManager;
        const b=manager.character3dBuilder=new Character3DBuilder();b._refreshThumbs=()=>{};b.tab='outfit';
        b.recipe=RRCharacterModel.normalize({gender:1,weight:.62,muscle:.64,outfit:[{id:arguments[1],color:'#3c607f',sleeves:1}]});
        manager.openTool('character-3d-builder');return true;`,[project,ids[0]]);
    await driver.waitForScript('return !!reactor.forgeManager.character3dBuilder._result;',[],{timeout:120000});
    const handoff=await run(`const b=reactor.forgeManager.character3dBuilder;window.__originalWearRecipe=JSON.stringify(b.recipe);b.root.querySelector('[data-act="garment-prop"]').click();return true;`);
    assert.equal(handoff,true);
    await driver.waitForScript('return reactor.forgeManager.propBuilder?._result?.kind==="garment";',[],{timeout:120000});
    const reports=[];
    for(const [i,id]of ids.entries()) {
        if(i)await run(`const b=reactor.forgeManager.propBuilder;b.search='';b._renderTypes();b.root.querySelector('[data-type="garment-'+arguments[0]+'"]').click();return true;`,[id]);
        await driver.waitForScript('return reactor.forgeManager.propBuilder._result?.recipe.garment.id===arguments[0];',[id],{timeout:60000});
        const controls=await run(`const b=reactor.forgeManager.propBuilder;
            const randomMenu=b.root.querySelector('.rr-random-parts');randomMenu.querySelector('.rr-random-parts-toggle').click();randomMenu.querySelector('[data-part="colors"]').click();const randomChoice=!b.randomParts.has('colors')&&!JSON.parse(localStorage.getItem('rr-random-parts:prop-garment')).includes('colors');randomMenu.querySelector('[data-part="colors"]').click();randomMenu.querySelector('.rr-random-parts-toggle').click();if(!randomChoice||!b.randomParts.has('colors'))throw Error('Randomization choices did not persist');
            const before=JSON.stringify(b.recipe);b.root.querySelector('[data-tab="fit"]').click();
            const wanted=b.recipe.body.weight<.7?.73:.61,el=b.root.querySelector('[data-path="body.weight"]');el.value=wanted;const Event=el.ownerDocument.defaultView.Event;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
            const changed=b.recipe.body.weight===wanted;b.root.querySelector('.rr-prop-undo').click();const undo=JSON.stringify(b.recipe)===before;b.root.querySelector('.rr-prop-redo').click();
            const previous=JSON.stringify(b.recipe),body=JSON.stringify(b.recipe.body);b.root.querySelector('.rr-prop-random').click();const randomChanged=JSON.stringify(b.recipe)!==previous&&JSON.stringify(b.recipe.body)===body;b.root.querySelector('.rr-prop-undo').click();const randomUndo=JSON.stringify(b.recipe)===previous;b._rebuild();b._render();return {changed,undo,randomChanged,randomUndo,idleStatic:!b._view.clipAction&&!b._advance(1/60),redo:b.recipe.body.weight===wanted,handoff:arguments[0]===0?b.recipe.body.gender===1&&b.recipe.body.muscle===.64:true,gl:b._view.renderer.getContext().getError()};`,[i]);
        assert.equal(controls.changed,true);assert.equal(controls.idleStatic,true);assert.equal(controls.randomChanged,true);assert.equal(controls.randomUndo,true);assert.equal(controls.undo,true);assert.equal(controls.redo,true);assert.equal(controls.handoff,true);assert.equal(controls.gl,0);
        const report=await run(`const b=reactor.forgeManager.propBuilder;if(arguments[0]==='shirt'){b._set('garment.pattern','emblem');b._set('garment.emblemPicture','Badge');b._renderPanel();}b.name='Audit '+arguments[0];await b.save();
            const fs=require('fs'),path=require('path'),folder=path.join(b._project().path,'3d/Props',b.name);
            const sidecar=JSON.parse(fs.readFileSync(path.join(folder,'model.json'),'utf8')),saved=JSON.stringify(b.recipe);
            b._openSaved(b.name);b._rebuild();b._render();
            fs.cpSync(folder,path.join(arguments[1],b.name),{recursive:true});
            const bones=new Set();for(const p of b._result.parts)for(let k=0;k<p.joints.length;k++)if(p.weights[k]>.01)bones.add(b._result.bones[p.joints[k]].name);
            return {id:arguments[0],emblem:arguments[0]!=='shirt'||!!b._images.Badge,mode:sidecar.wear.mode,reopened:saved===JSON.stringify(b.recipe),bones:[...bones],parts:b._result.parts.length,triangles:b._result.triangles,
                image:b._view.renderer.domElement.toDataURL('image/png'),gl:b._view.renderer.getContext().getError(),errors:__wearErrors};`,[id,out]);
        fs.writeFileSync(path.join(out,id+'.png'),Buffer.from(report.image.split(',')[1],'base64'));delete report.image;
        assert.equal(report.mode,'skinned');assert.equal(report.emblem,true);assert.equal(report.reopened,true);assert.ok(report.bones.length>=2);assert.equal(report.gl,0);assert.equal(report.errors.length,0,JSON.stringify(report.errors));
        if(id==='shirt') {
            const motion=await run(`const b=reactor.forgeManager.propBuilder,R=Reactor3D,T=THREE;
                const result=b._result,body=RRHumanBody.build(await RRHumanBody.loadPack(),b.recipe.body);
                body.parts[0].color='#bc8f70';body.parts[1].color='#dddddd';
                const bytes=RRCharacterGlb.toGlb(body,{images:{},clips:result.clips});
                const wearer=R.readModel(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'.glb','',null,{studio:true});
                const fs=require('fs'),path=require('path'),file=path.join(b._project().path,'3d/Props/Audit shirt/source/Audit shirt.glb');
                const raw=fs.readFileSync(file);const source=R.readModel(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'.glb','',null,{studio:true});
                await Database3DEditor.whenTexturesDecoded(source.userData.glbTextures,10000);
                for(const def of result.sidecarExtra.wear.bones){const bone=wearer.getObjectByName(def.name);if(def.part&&bone){bone.userData.__reactorRigBone=true;bone.userData.parts=[{name:def.part}];}}
                const holder={object:wearer,wornRest:R.Worn.rest(wearer)};
                const worn=R.Worn.put(holder,source,result.sidecarExtra,{scale:1},null);if(!worn)throw Error('Shirt could not be equipped');holder.worn=[worn];
                b._clearModel();b._view.group.add(wearer);wearer.traverse(n=>{n.matrixAutoUpdate=true;n.matrixWorldAutoUpdate=true;});wearer.updateMatrixWorld(true);const hand=wearer.getObjectByName('RightHand'),before=hand.getWorldPosition(new T.Vector3());wearer.getObjectByName('RightForeArm').rotation.set(-1.2,0,.25);wearer.updateMatrixWorld(true);const handTravel=before.distanceTo(hand.getWorldPosition(new T.Vector3()));
                b._view.floor.position.y=-.001;b._view.blob.position.y=.001;b._view.distance=4.5;b._view.target.set(0,.9,0);b._render();
                let meshes=0;worn.traverse(n=>{if(n.isSkinnedMesh)meshes++;});
                const image=b._view.renderer.domElement.toDataURL('image/png'),gl=b._view.renderer.getContext().getError();
                R.Worn.clear(holder);b._view.group.remove(wearer);b._rebuild();return {meshes,image,gl,handTravel};`);
            fs.writeFileSync(path.join(out,'shirt-equipped-bent.png'),Buffer.from(motion.image.split(',')[1],'base64'));delete motion.image;
            assert.ok(motion.meshes>0);assert.ok(motion.handTravel>.03);assert.equal(motion.gl,0);report.motion=motion;
        }
        reports.push({...report,controls});console.log(JSON.stringify(reports.at(-1)));
    }
    const preserved=await run(`return JSON.stringify(reactor.forgeManager.character3dBuilder.recipe)===__originalWearRecipe;`);assert.equal(preserved,true);
    const layout=await run(`const b=reactor.forgeManager.propBuilder,sizes=[];for(let i=0;i<8;i++){await new Promise(resolve=>b.root.ownerDocument.defaultView.requestAnimationFrame(resolve));const c=b._view.renderer.domElement;sizes.push([c.width,c.height]);}return {sizes,notices:__wearLayoutNotices.length};`);assert.ok(layout.notices<8,'bounded layout notifications');assert.ok(layout.sizes.every(s=>s[0]>0&&s[1]>0&&JSON.stringify(s)===JSON.stringify(layout.sizes[0])),'preview dimensions settle');fs.writeFileSync(path.join(out,process.argv.some(a=>a.startsWith('--ids='))?'report-'+ids.join('-')+'.json':'report.json'),JSON.stringify({reports,preserved,layout},null,2));
} finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
