#!/usr/bin/env node
/**
 * The real Character Builder on one saved recipe, in a temp project: named close-ups for judging faces, skin and
 * clothing fit, with the game's own lighting. --recipe=<file> --out=<dir> --shots=<json: [{name,patch,preset,view}]>
 * A view is { yaw, pitch, distance, target: 'head'|'mouth'|'eyes'|'chest'|'hips'|'body' }. Output stays out of the repository.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {WebDriverClient}=require('./webdriver-client.cjs'),root=path.resolve(__dirname,'../../..');
const opt=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const saved=JSON.parse(fs.readFileSync(opt('recipe'),'utf8')),recipe=saved.recipe||saved,shots=JSON.parse(fs.readFileSync(opt('shots'),'utf8'));
const out=path.resolve(opt('out'));fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-character-review-')),project=path.join(temp,'Project');
fs.mkdirSync(path.join(project,'data'),{recursive:true});fs.writeFileSync(path.join(project,'data/System.json'),'{}');
let display,log='';const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
async function run(code,args=[]){const r=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{${code}})().then(done,e=>done({error:String(e.stack)}));`,args);if(r?.error)throw Error(r.error);return r;}
(async()=>{try{
    display=spawn(path.join(root,'editor/tests/perf/headless-display.sh'),[],{env:process.env});
    process.env.DISPLAY=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Display startup timed out')),20000);display.stdout.on('data',b=>{log+=b;const m=log.match(/(?:^|\n)(:\d+)\s/);if(m){clearTimeout(timer);resolve(m[1]);}});});
    process.env.XAUTHORITY='';process.env.XDG_SESSION_TYPE='x11';delete process.env.WAYLAND_DISPLAY;process.env.__GLX_VENDOR_LIBRARY_NAME='mesa';driver.env={...driver.env,...process.env};delete driver.env.WAYLAND_DISPLAY;
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${root}/editor`,`user-data-dir=${temp}/profile`,'no-first-run','js-flags=--max-old-space-size=1024']}});await driver.setScriptTimeout(180000);
    await driver.waitForScript('return !!window.reactor?.forgeManager;',[],{timeout:90000});
    await run(`window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error?.stack||e.message)));
        const pc=reactor.projectController;pc.currentProject={path:arguments[0]};await pc.mapEditor3D.ensureLibraries();Character3DBuilder.weakGpu=()=>false;
        const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(host);
        window.__b=new Character3DBuilder();__b.recipe=RRCharacterModel.normalize(arguments[1]);__b.pose='apose';__b._refreshThumbs=()=>{};__b.renderInto(host,pc);return true;`,[project,recipe]);
    await driver.waitForScript('return !!__b._result&&__b._view?.meshes.length>0;',[],{timeout:120000});
    const report=[];
    for(const shot of shots){
        await run(`const b=__b,[base,shot]=arguments;let r=JSON.parse(JSON.stringify(base));
            if(!window.__settle)window.__settle=RRCharacterFit.settle;RRCharacterFit.settle=shot.noFit?(()=>[]):__settle;
            if(shot.preset){const p=RRCharacterWardrobe.PRESETS.find(q=>q.id===shot.preset||q.label===shot.preset);if(!p)throw Error('No preset '+shot.preset);r.outfit=RRCharacterWardrobe.dressFor?RRCharacterWardrobe.dressFor(p.items,true):p.items;}
            if(shot.patch){const merge=(a,c)=>{for(const k of Object.keys(c)){if(c[k]&&typeof c[k]==='object'&&!Array.isArray(c[k]))merge(a[k]||(a[k]={}),c[k]);else a[k]=c[k];}};merge(r,shot.patch);}
            const was=console.error,bad=[];console.error=(...x)=>{bad.push(x.join(' '));was(...x);};b.recipe=RRCharacterModel.normalize(r);b._rebuild();console.error=was;if(bad.length)throw Error('Build failed: '+bad.join(' ').slice(0,300));return true;`,[recipe,shot]);
        await driver.waitForScript('const b=__b;return !!b.cache.skinKey&&!b._painter?.busy&&!b._painter?.next&&!b._pending;',[],{timeout:120000});
        const r=await run(`const b=__b,v=b._view,s=arguments[0].view||{},bones=b._result.bones,at=n=>bones.find(x=>x.name===n).head;
            const head=at('Head'),spine=at('Spine2'),hips=at('Hips'),t={head:[head[0],head[1]+.09,head[2]],mouth:[0,head[1]-.015,head[2]+.09],face:[0,head[1]+.03,head[2]+.05],eyes:[0,head[1]+.075,head[2]+.09],chest:[spine[0],spine[1]+.03,spine[2]+.06],hips:[hips[0],hips[1]-.04,hips[2]],body:[0,b._result.height/2,0]}[s.target||'body'];
            const note=arguments[0].js?await (0,eval)('(async(b,v,THREE)=>{'+arguments[0].js+'})')(b,v,THREE):undefined;v.distance=s.distance||2.6;v.yaw=s.yaw??.4;v.pitch=s.pitch??.05;v.target.set(...(s.at||t));b._render();
            return {image:v.renderer.domElement.toDataURL('image/png'),note,errors:__errors.length,triangles:b._result.parts.reduce((n,p)=>n+p.index.length/3,0)};`,[shot]);
        fs.writeFileSync(path.join(out,shot.name+'.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;report.push({name:shot.name,...r});
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));console.log(report.length,'shots',report.reduce((n,r)=>n+r.errors,0),'errors');
}finally{await driver.close().catch(()=>{});display?.kill();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(String(e.stack).slice(0,600));process.exitCode=1;});
