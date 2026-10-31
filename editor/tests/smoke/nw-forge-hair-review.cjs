#!/usr/bin/env node
/** Native hair silhouettes, four styles per browser; run through codex-check on an isolated display. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {WebDriverClient}=require('./webdriver-client.cjs'),root=path.resolve(__dirname,'../../..');
const opt=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const styles=opt('styles','centerPartShort,centerPartLong,faceSweep,beehive').split(',');assert.ok(styles.length<=4);
const out=path.resolve(opt('out','scratchpad/forge-wearables-hair-20261029/final-hair'));fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-forge-hair-')),project=path.join(temp,'Project');
fs.mkdirSync(path.join(project,'data'),{recursive:true});fs.writeFileSync(path.join(project,'data/System.json'),'{}');
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
async function run(code,args=[]){const r=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${code}})().then(done,e=>done({error:String(e.stack)}));`,args);assert.ok(!r?.error,r?.error);return r;}
(async()=>{try{
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${root}/editor`,`user-data-dir=${temp}/profile`,'no-first-run','js-flags=--max-old-space-size=1024']}});await driver.setScriptTimeout(180000);
    await driver.waitForScript('return !!window.reactor?.forgeManager;',[],{timeout:90000});
    await run(`window.__hairErrors=[];addEventListener('error',e=>__hairErrors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>__hairErrors.push(String(e.reason?.stack||e.reason)));
        const pc=reactor.projectController;pc.currentProject={path:arguments[0]};await pc.mapEditor3D.ensureLibraries();
        if(arguments[3]){const previous=RRCharacterHair;(0,eval)(require('fs').readFileSync(arguments[3],'utf8'));Object.assign(previous,RRCharacterHair);window.RRCharacterHair=previous;}
        Character3DBuilder.weakGpu=()=>false;const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(host);
        window.__hairBuilder=new Character3DBuilder();__hairBuilder.recipe=RRCharacterModel.normalize({gender:Number(arguments[2]),hair:{style:arguments[1],color:'#40281c',volume:.5,fringe:0}});
        __hairBuilder.tab='hair';__hairBuilder.pose='apose';__hairBuilder._refreshThumbs=()=>{};__hairBuilder.renderInto(host,pc);return true;`,[project,styles[0],opt('gender','0'),opt('baseline','')]);
    await driver.waitForScript('return !!__hairBuilder._result&&__hairBuilder._view?.meshes.length>0;',[],{timeout:120000});
    const report=[];
    for(const style of styles){
        await run(`const b=__hairBuilder;b.recipe=RRCharacterModel.normalize({...b.recipe,hair:RRCharacterHair.withStyle(b.recipe.hair,arguments[0])});b._rebuild();return true;`,[style]);
        await driver.waitForScript('const b=__hairBuilder;return !!b.cache.skinKey&&!b._painter?.busy&&!b._painter?.next&&!b._pending;',[],{timeout:120000});
        const views=[];
        for(const back of [false,true]){
            const r=await run(`const b=__hairBuilder,v=b._view,H=RRCharacterHair._internal.measure(b.pack,b._result.built);
                const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
                for(const p of b._result.parts.filter(p=>p.name==='Hair'))for(let j=0;j<p.positions.length;j+=3)for(let k=0;k<3;k++){low[k]=Math.min(low[k],p.positions[j+k]);high[k]=Math.max(high[k],p.positions[j+k]);}
                low[1]=Math.min(low[1],H.chin[1]);
                const radius=Math.hypot(...high.map((x,k)=>x-low[k]))/2;
                v.distance=arguments[2]?1.4:Math.max(.7,radius/Math.sin(v.camera.fov*Math.PI/360)*1.13);
                v.yaw=arguments[1]?2.5:.55;v.pitch=.05;v.target.set(...low.map((x,k)=>(x+high[k])/2));
                if(arguments[2])v.target.set(H.center[0],H.center[1]-.12,H.center[2]);b._render();
                const gl=v.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
                return {style:arguments[0],back:arguments[1],image:v.renderer.domElement.toDataURL('image/png'),triangles:b._result.parts.filter(p=>p.name==='Hair').reduce((n,p)=>n+p.index.length/3,0),
                    gl:gl.getError(),lost:gl.isContextLost(),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),errors:__hairErrors};`,[style,back,opt('compare','')==='true']);
            fs.writeFileSync(path.join(out,style+(back?'-back':'')+'.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;
            assert.equal(r.gl,0);assert.equal(r.errors.length,0,JSON.stringify(r.errors));views.push(r);
        }
        report.push({style,views});console.log(JSON.stringify(report.at(-1)));
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
}finally{fs.writeFileSync(path.join(out,'driver.log'),driver.output);await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
