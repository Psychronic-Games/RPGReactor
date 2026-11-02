#!/usr/bin/env node
/**
 * Every control on a Character Builder tab, used as a person uses it: the real panel in the real editor, each slider moved
 * and each option picked through its own element. A control fails if the setting doesn't stay, the character doesn't change,
 * or an error appears. --recipe=<file> --out=<dir> [--tab=face] [--only=<path parts, comma separated>] [--exact]. Output stays out of the repository.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {WebDriverClient}=require('./webdriver-client.cjs'),root=path.resolve(__dirname,'../../..');
const opt=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const saved=JSON.parse(fs.readFileSync(opt('recipe'),'utf8')),recipe=saved.recipe||saved;
const out=path.resolve(opt('out'));fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-character-audit-')),project=path.join(temp,'Project');
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
    // In short steps, one setting at a time: a long script times out, and this way every result is kept and shown as it comes.
    await driver.setScriptTimeout?.(30000);
    const paths=await run(`const b=__b;window.__wait=ms=>new Promise(r=>setTimeout(r,ms));
        window.__pictureHash=new WeakMap();window.__print=()=>{let sum=0,count=0;b._view.scene.traverse(o=>{if(!o.isMesh||!o.visible)return;count++;const p=o.geometry?.getAttribute?.('position');if(p)for(let i=0;i<p.array.length;i+=1)sum+=p.array[i]*(i%7+1);if(o.morphTargetInfluences)for(const w of o.morphTargetInfluences)sum+=w*3;const m=o.material;if(m){if(m.map){sum+=m.map.version*.001;const data=m.map.image?.data;if(data){let hash=__pictureHash.get(data);if(hash===undefined){hash=2166136261;for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);hash>>>=0;__pictureHash.set(data,hash);}sum+=hash*.0000001;}}if(m.color)sum+=m.color.r+m.color.g*2+m.color.b*3;}});return count+':'+sum.toFixed(4)+':'+String(b.cache.skinKey||'').length+String(b.cache.skinKey||'').slice(-24);};
        window.__settle=async()=>{let last='',same=0;for(let i=0;i<100;i++){await __wait(200);const now=__print(),busy=b._pending||b._painter?.busy||b._painter?.next||b._settle||b._liveJob?.busy||b._liveJob?.owed||b._previewTween;if(now===last&&!busy)same++;else same=0;last=now;if(same>=2)return last;}throw Error('Character did not settle');};
        window.__controls=()=>[...b.root.querySelectorAll('[data-path]')].filter(e=>e.matches('input,select'));
        b.tab=arguments[0];b.extreme=arguments[3];b._renderPanel();await __wait(100);window.__start=JSON.stringify(b.recipe);await __settle();
        return [...new Set(__controls().map(e=>e.dataset.path))].filter(p=>!arguments[1]||arguments[1].split(',').some(q=>arguments[2]?p===q:p.includes(q)));`,[opt('tab','face'),opt('only',''),process.argv.includes('--exact'),process.argv.includes('--extreme')]);
    const report={controls:paths.length,tried:0,bad:[],drags:[]};
    if(process.argv.includes('--drag-release'))await run(`
        window.__snapshot=()=>({recipe:JSON.stringify(__b.recipe),parts:__b._result.parts.map((p,i)=>({name:p.name,
            positions:Float32Array.from(__b._view.meshes[i].geometry.getAttribute('position').array),
            normals:Float32Array.from(__b._view.meshes[i].geometry.getAttribute('normal').array)})),
            camera:[...__b._view.target.toArray(),__b._view.distance,__b._view.yaw,__b._view.pitch]});
        window.__fastSamples=[];const fast=__b._fastApply;__b._fastApply=function(...args){const active=this._view&&this._fast?.result===this._result,result=fast.apply(this,args);if(active){window.__lastFast=__snapshot();if(__fastSamples.length<128)__fastSamples.push({at:performance.now(),signature:__print()});}return result;};
        window.__inputs=0;window.__samples=[];window.__lastInput=0;window.__tweenFrames=0;const render=__b._render;__b._render=function(){if(this._previewTween)__tweenFrames++;return render.call(this);};
        __b.root.addEventListener('input',e=>{if(e.isTrusted&&e.target.type==='range'){__inputs++;__lastInput=performance.now();}});
        window.__reuses=0;const update=__b._update;__b._update=function(...args){__reuses++;return update.apply(this,args);};
        const apply=__b._applyBuild;__b._applyBuild=function(result){const answer=apply.call(this,result);if(this._rangeDrag&&__samples.length<64)__samples.push({at:performance.now(),value:this._rangeDrag.path.split('.').reduce((o,k)=>o?.[k],result.recipe)});return answer;};return true;`);
    for(const p of paths){
        if(process.argv.includes('--drag-release')){
            const point=await run(`await __settle();const el=__controls().find(e=>e.dataset.path===arguments[0]&&e.type==='range');if(!el)return null;
                el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect(),t=(+el.value-+el.min)/(+el.max-+el.min),end=t>.5?.25:.75;
                window.__lastFast=null;window.__held=null;window.__reuses=0;window.__inputs=0;window.__samples=[];window.__fastSamples=[];window.__lastInput=0;window.__tweenFrames=0;
                return {x:Math.round(r.left+8+t*(r.width-16)),y:Math.round(r.top+r.height/2),end:Math.round(r.left+8+end*(r.width-16))};`,[p]);
            if(!point)continue;
            const pointer=actions=>driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'character-slider',parameters:{pointerType:'mouse'},actions}]});
            const moves=process.argv.includes('--continuous')?Array.from({length:24},(_,i)=>({type:'pointerMove',duration:150,x:Math.round(point.x+(point.end-point.x)*(i+1)/24),y:point.y})):[{type:'pointerMove',duration:350,x:point.end,y:point.y}];
            await pointer([{type:'pointerMove',duration:0,x:point.x,y:point.y},{type:'pointerDown',button:0},...moves]);
            const held=await run(`await __settle();window.__held=__lastFast||__snapshot();__b._render();return {image:__b._view.renderer.domElement.toDataURL('image/png'),inputs:__inputs,fast:!!__lastFast,value:__b._get(arguments[0]),samples:__samples,fastSamples:__fastSamples,fastUpdatesBeforeLastInput:__fastSamples.filter(s=>s.at<__lastInput).length,tweenFrames:__tweenFrames,reusedBuilds:__reuses,updatesBeforeLastInput:__samples.filter(s=>s.at<__lastInput).length};`,[p]);
            fs.writeFileSync(path.join(out,p.replace(/\W/g,'-')+'-held.png'),Buffer.from(held.image.split(',')[1],'base64'));delete held.image;
            await pointer([{type:'pointerUp',button:0}]);
            const released=await run(`await __settle();const after=__snapshot(),before=__held,changes=[];let position=0,normal=0,camera=0;
                for(const [i,part]of before.parts.entries()){
                    const next=after.parts[i];if(!next||part.name!==next.name||part.positions.length!==next.positions.length){changes.push(part.name);continue;}
                    for(let k=0;k<part.positions.length;k++){position=Math.max(position,Math.abs(part.positions[k]-next.positions[k]));normal=Math.max(normal,Math.abs(part.normals[k]-next.normals[k]));}
                }
                if(before.parts.length!==after.parts.length)changes.push('part count');
                before.camera.forEach((value,i)=>camera=Math.max(camera,Math.abs(value-after.camera[i])));
                __b._render();return {position,normal,camera,topologyChanges:changes,recipeMatches:before.recipe===after.recipe,errors:__errors.length,image:__b._view.renderer.domElement.toDataURL('image/png')};`);
            fs.writeFileSync(path.join(out,p.replace(/\W/g,'-')+'-released.png'),Buffer.from(released.image.split(',')[1],'base64'));delete released.image;
            const problems=[];
            if(!held.inputs)problems.push('no trusted range input');
            if(process.argv.includes('--reuse')&&!held.reusedBuilds)problems.push('matching meshes were rebuilt');
            if(process.argv.includes('--smooth')&&held.tweenFrames<10)problems.push('no interpolated display frames');
            const progressiveWorker=held.updatesBeforeLastInput>=2&&new Set(held.samples.map(s=>s.value)).size>=2;
            const progressiveFast=held.fastUpdatesBeforeLastInput>=2&&new Set(held.fastSamples.map(s=>s.signature)).size>=2;
            if(process.argv.includes('--continuous')&&(held.inputs<5||!progressiveWorker&&!progressiveFast))problems.push('no progressive updates during continuous drag');
            if(!released.recipeMatches)problems.push('recipe changed on release');
            if(released.topologyChanges.length||released.position>0.000002||released.normal>0.001)problems.push('preview shape changed on release');
            if(released.camera>0.00001)problems.push('camera changed on release');
            if(released.errors)problems.push('runtime errors');
            report.tried++;report.drags.push({path:p,held,...released});
            if(problems.length)report.bad.push({path:p,problems});
            fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
            console.log(p,JSON.stringify({position:released.position,normal:released.normal,camera:released.camera,problems}));
            await run(`const b=__b;b.expression='neutral';b.recipe=RRCharacterModel.normalize(JSON.parse(__start));b._renderPanel();b._rebuild();return true;`);
            continue;
        }
        const wants=await run(`const el=__controls().find(e=>e.dataset.path===arguments[0]);if(!el)return [];return el.tagName==='SELECT'?[...el.options].map(o=>o.value).filter(v=>v!==el.value).slice(0,4):el.type==='range'?[String(+el.value+(+el.max-+el.min)*.6>+el.max?+el.min:+el.value+(+el.max-+el.min)*.6)]:el.type==='checkbox'?['toggle']:[];`,[p]);
        for(const want of wants){
            const r=await run(`const [path,want]=arguments,b=__b,errors=__errors.length,before=await __settle(),live=__controls().find(e=>e.dataset.path===path);
                if(want==='toggle')live.checked=!live.checked;else live.value=want;
                live.dispatchEvent(new Event('input',{bubbles:true}));live.dispatchEvent(new Event('change',{bubbles:true}));await __wait(1500);
                const after=await __settle(),again=__controls().find(e=>e.dataset.path===path),kept=!again?false:want==='toggle'?true:again.tagName==='SELECT'?again.value===want:Math.abs(+again.value-+want)<=Math.max(+again.step||0,.0001)*1.01,problems=[];
                if(!kept)problems.push('did not stay: '+(again?again.value:'control gone')+' after '+want);// (Custom eyes only stop following a preset: the eye sliders under it do the changing.)
                if(after===before&&!(path==='eyeStyle'&&want==='custom'))problems.push('nothing changed on the character');if(__errors.length>errors)problems.push('error: '+__errors[__errors.length-1].slice(0,120));
                b.expression='neutral';b._eyeCustom=false;b.recipe=RRCharacterModel.normalize(JSON.parse(__start));b._renderPanel();b._rebuild();return problems;`,[p,want]);
            report.tried++;
            if(r.length){report.bad.push({path:p,want,problems:r});console.log(' ',p.padEnd(26),String(want).padEnd(12),r.join('; '));}
        }
    }
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
    console.log(report.controls,'controls,',report.tried,'settings tried,',report.bad.length,'problems');
    process.exitCode=report.bad.length?1:0;
}finally{await driver.close().catch(()=>{});display?.kill();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(String(e.stack).slice(0,600));process.exitCode=1;});
