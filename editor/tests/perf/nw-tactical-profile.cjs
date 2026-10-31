#!/usr/bin/env node
/**
 * Profile North Haven's Tactical raid on a disposable Demo copy with its plugins.
 * Compares shared skins against former per-mesh skeleton copies in the same live
 * scene, checks identical frozen world pixels, then moves a unit and runs AI.
 * Uncapped headless throughput is not a physical display benchmark. Run through
 * codex-check on the isolated display described in headless-display.sh.
 *
 * node editor/tests/perf/nw-tactical-profile.cjs --out=<dir> [--seconds=4] [--profile]
 *      [--slow-cpu=4] [--render-node=/dev/dri/renderD129]
 * Not part of node --test. All sessions and copied project files are cleaned up.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', path.join(os.tmpdir(), 'rr-tactical-profile')));
const seconds = Number(option('seconds', '4'));
const profileCpu = process.argv.includes('--profile');
const renderNode = option('render-node', '');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactical-perf-'));
const project = path.join(temp, 'Demo'), demo = path.join(root, 'template/Demo');
fs.mkdirSync(project);
for (const n of ['index.html', 'package.json', 'project.rpgreactor']) fs.copyFileSync(path.join(demo, n), path.join(project, n));
if (renderNode) {
    const file = path.join(project, 'package.json'), pkg = JSON.parse(fs.readFileSync(file));
    pkg['chromium-args'] = (pkg['chromium-args'] || '').replace('--force-high-performance-gpu', '');
    fs.writeFileSync(file, JSON.stringify(pkg));
}
for (const n of ['data', 'js', 'icon', 'css']) fs.cpSync(path.join(demo, n), path.join(project, n), { recursive: true });
for (const n of ['img', '3d', 'audio', 'effects', 'fonts', 'movies']) if (fs.existsSync(path.join(demo, n))) fs.symlinkSync(path.join(demo, n), path.join(project, n));
for (const n of fs.readdirSync(path.join(root, 'runtime'))) if (n.endsWith('.js') && n !== 'reactor_plugins.js') fs.copyFileSync(path.join(root, 'runtime', n), path.join(project, 'js', n));
const write = (n, data) => fs.writeFileSync(path.join(project, 'data', n), JSON.stringify(data));
const system = JSON.parse(fs.readFileSync(path.join(project, 'data/System.json')));
Object.assign(system, { startMapId: 5, startX: 80, startY: 58, rrSkipTitle: false });
write('System.json', system);
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const cdp = (cmd, params = {}) => driver.sessionRequest('POST', '/goog/cdp/execute', { cmd, params });
async function measure(name, seconds = 4, profile = profileCpu) {
    if (profile) { await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start'); }
    const report = await driver.executeAsync(`
        const seconds = arguments[0], done = arguments[arguments.length-1];
        const R=Reactor3D, ss=SceneManager._scene._spriteset, v=ss._reactor3d, renderer=v.viewport.renderer(), gl=renderer.getContext();
        const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'), pending=[], gpu=[], frames=[], samples={}, restore=[];
        let query=null,last=performance.now(),start=last,world=Graphics.worldFrameCount||0,updates=Graphics.frameCount,draws=0,tris=0;
        const hook=(o,k,name)=>{if(!o||typeof o[k]!=='function')return;const fn=o[k];const s=samples[name]={n:0,ms:0,max:0};o[k]=function(){const t=performance.now();try{return fn.apply(this,arguments);}finally{const dt=performance.now()-t;s.n++;s.ms+=dt;s.max=Math.max(s.max,dt);}};restore.push(()=>o[k]=fn);};
        for(const k of ['update','ensureFlood','moveCells','rangeCells','threatOfAll','previewCells','updateAi'])hook(Game_Fight.prototype,k,'fight.'+k);
        for(const k of ['collect','update']) hook(ReactorFight.Marks,k,'marks.'+k);
        hook(R.MapHeld,'update','held');hook(R.Worn,'update','worn');
        hook(ReactorFight.AI,'think','ai.think');
        hook(R,'applyModelAnimation','animation');
        hook(ss,'updateReactor3D','sync3d');hook(ss,'drawReactor3D','draw3d');
        hook(Graphics.FramePacing,'capture','poseCapture');hook(Graphics.FramePacing,'draw','interpolatedDraw');
        const render=renderer.render;renderer.render=function(){const result=render.apply(this,arguments);draws+=this.info.render.calls;tris+=this.info.render.triangles;return result;};restore.push(()=>renderer.render=render);
        const tick=Graphics._tickHandler,composite=Graphics._app.render;
        const begin=()=>{if(ext&&!query){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}};
        const end=()=>{if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(query);query=null;}};
        Graphics._tickHandler=function(){end();begin();return tick.apply(this,arguments);};
        Graphics._app.render=function(){begin();try{return composite.apply(this,arguments);}finally{end();}};
        restore.push(()=>{Graphics._tickHandler=tick;Graphics._app.render=composite;});
        const finish=()=>{end();for(const f of restore.reverse())f();for(const q of pending)gl.deleteQuery(q);
            const p=(a,f)=>{const s=a.slice().sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*f))].toFixed(3):null;};
            const elapsed=performance.now()-start,n=(Graphics.worldFrameCount||0)-world;
            done({seconds:+(elapsed/1000).toFixed(2),frames:frames.length,world:n,updates:Graphics.frameCount-updates,fps:+(n*1000/elapsed).toFixed(1),frameP50:p(frames,.5),frameP95:p(frames,.95),max:p(frames,1),gpuP50:p(gpu,.5),gpuP95:p(gpu,.95),draws:+(draws/n).toFixed(1),triangles:Math.round(tris/n),samples:Object.fromEntries(Object.entries(samples).map(([k,s])=>[k,{n:s.n,perFrame:+(s.ms/frames.length).toFixed(3),max:+s.max.toFixed(3)}])),phase:$gameFight._phase,act:$gameFight._act,units:$gameFight._units.length,camera:Reactor3D.Camera.currentState(),errors:window.__rrErrors,gl:gl.getError()});};
        const step=()=>{const t=performance.now();frames.push(t-last);last=t;
            if(ext)for(let i=pending.length-1;i>=0;i--){const q=pending[i];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);pending.splice(i,1);}}
            if(t-start<seconds*1000)requestAnimationFrame(step);else finish();};requestAnimationFrame(step);
    `, [seconds]);
    if (profile) {
        const { profile: data } = await cdp('Profiler.stop');
        fs.writeFileSync(path.join(out, name+'.cpuprofile'), JSON.stringify(data));
        const nodes=new Map(data.nodes.map(n=>[n.id,n]));
        const self=new Map();for(let i=0;i<data.samples.length;i++){const n=nodes.get(data.samples[i]);const k=n.callFrame.functionName+' '+path.basename(n.callFrame.url)+':'+(n.callFrame.lineNumber+1);self.set(k,(self.get(k)||0)+(data.timeDeltas[i]||0)/1000);}
        report.cpuTop=[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([name,ms])=>({name,ms:+ms.toFixed(1)}));
    }
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(report,null,2));
    console.log(name,JSON.stringify({fps:report.fps,frameP50:report.frameP50,frameP95:report.frameP95,max:report.max,gpuP50:report.gpuP50,draws:report.draws,triangles:report.triangles,samples:report.samples,errors:report.errors}));
    assert.ok(report.world>0,name+' draws the world');
    assert.equal(report.gl,0,name+' has no WebGL error');
    assert.deepEqual(report.errors,[],name+' has no runtime exception');
    return report;
}
(async()=>{try{
    await driver.start();
    await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','disable-background-timer-throttling','disable-gpu-vsync','disable-frame-rate-limit','mute-audio','js-flags=--max-old-space-size=1024',...(renderNode?['render-node-override='+renderNode]:[])]}});
    await driver.setScriptTimeout(180000);
    await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
    await driver.waitForScript('return !!window.$dataSystem && !!window.SceneManager?._scene && DataManager.isDatabaseLoaded() && ConfigManager.isLoaded() && SceneManager._scene.isStarted() && !(SceneManager._scene instanceof Scene_Boot) && !SceneManager.isSceneChanging();',[],{timeout:120000});
    await driver.execute(`window.__rrErrors=[];addEventListener('error',e=>__rrErrors.push(String(e.error?.stack||e.message)));SceneManager.isGameActive=()=>true;Reactor3D.Quality.enabled=false;ConfigManager.graphicsQuality='high';DataManager.setupNewGame();SceneManager.goto(Scene_Map);`);
    await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0&&[...v.scene._modelInstances.values()].some(h=>h.character===$gamePlayer&&h.object);`,[],{timeout:120000});
    console.log('boot',JSON.stringify(await driver.execute(`return {gpu:Graphics.gpuDescription,tier:Graphics.gpuTier,revision:RPG_REACTOR_RUNTIME_REVISION,resolution:[Graphics.width,Graphics.height],quality:ConfigManager.graphicsQuality};`)));
    await driver.executeAsync(`const done=arguments[arguments.length-1];setTimeout(()=>done(true),4000);`);
    await measure('exploration',seconds);
    await driver.execute(`$gameSwitches.setValue(1,true);$gameSwitches.setValue(4,true);$gameParty.addActor(9);$gameMap.requestRefresh();`);
    await driver.executeAsync(`const done=arguments[arguments.length-1];setTimeout(()=>done(true),1000);`);
    await driver.execute(`const interpreter=new Game_Interpreter();const args=$dataMap.events[12].pages[0].list.find(c=>c.code===357&&c.parameters[1]==='StartMapBattle').parameters;PluginManager.callCommand(interpreter,args[0],args[1],{...args[3],wait:false});`);
    await measure('startup',seconds);
    await driver.waitForScript(`return $gameFight._act?.player && $gameFight._act.stage==='pick';`,[],{timeout:45000});
    await measure('selection',seconds);
    assert.equal(await driver.execute(`const u=$gameFight.pendingUnits().find(u=>u.party);window.__perfUnit=u.id;return $gameFight.commandSelectUnit(u.id);`),true);
    await measure('move-range',seconds);
    fs.writeFileSync(path.join(out,'selected.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    // Recreate the former per-mesh palettes on the same live scene, then
    // restore the shared skins. Each variant retains identical bones and binds.
    await driver.execute(`
        window.__splitSkins=()=>{const rows=[];SceneManager._scene._spriteset._reactor3d.scene.scene().traverse(mesh=>{
            if(!mesh.isSkinnedMesh)return;
            const shared=mesh.skeleton,split=new THREE.Skeleton(shared.bones,shared.boneInverses.map(m=>m.clone()));
            rows.push({mesh,shared,split});mesh.skeleton=split;
        });window.__skinRows=rows;return rows.length;};
        window.__shareSkins=()=>{for(const {mesh,shared,split} of __skinRows){mesh.skeleton=shared;split.dispose();}delete window.__skinRows;};
    `);
    const pixels = await driver.execute(`
        const ss=SceneManager._scene._spriteset,v=ss._reactor3d,R=Reactor3D,renderer=v.viewport.renderer();
        const ticker=Graphics._app.ticker,started=ticker.started,sharedStarted=PIXI.Ticker.shared.started,prepare=R.prepareWorldFrame;
        const realNow=performance.now,realDate=Date.now,now=performance.now(),date=Date.now();
        const capture=()=>{for(let i=0;i<8;i++)ss.drawReactor3D(v);const target=v.viewport.enlargedInComposite('below')?v.viewport._workTarget('below'):v.viewport._target('below');
            const bytes=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,bytes);return bytes;};
        ticker.stop();PIXI.Ticker.shared.stop();performance.now=()=>now;Date.now=()=>date;R.prepareWorldFrame=()=>{};
        try{
            const shared=capture(),skins=new Set();v.scene.scene().traverse(o=>{if(o.skeleton)skins.add(o.skeleton);});
            const repeated=capture(),meshes=__splitSkins(),split=capture();__shareSkins();const restored=capture();
            let different=0,restoredDifferent=0,selfDifferent=0,maxDifference=0;
            for(let i=0;i<shared.length;i++){if(shared[i]!==split[i])different++;if(shared[i]!==restored[i])restoredDifferent++;if(shared[i]!==repeated[i])selfDifferent++;maxDifference=Math.max(maxDifference,Math.abs(shared[i]-split[i]));}
            return {meshes,skeletons:skins.size,comparedBytes:shared.length,different,selfDifferent,restoredDifferent,maxDifference,gl:renderer.getContext().getError()};
        }finally{if(window.__skinRows)__shareSkins();R.prepareWorldFrame=prepare;performance.now=realNow;Date.now=realDate;if(sharedStarted)PIXI.Ticker.shared.start();if(started)ticker.start();}
    `);
    console.log('pixels',JSON.stringify(pixels));
    fs.writeFileSync(path.join(out,'pixels.json'),JSON.stringify(pixels,null,2));
    assert.equal(pixels.different,0,'shared skins render the same pixels as separate per-mesh palettes');
    assert.equal(pixels.restoredDifferent,0,'restoring shared skins keeps the image');
    assert.equal(pixels.gl,0);
    assert.ok(pixels.skeletons<pixels.meshes,'character parts share their skins in the live game');
    for(const throttle of new Set([1,Number(option('slow-cpu','4'))])){
        await cdp('Emulation.setCPUThrottlingRate',{rate:throttle});
        for(let i=1;i<=2;i++){
            await driver.execute('__splitSkins();');
            await measure('separate-skins-'+throttle+'x-'+i,seconds);
            await driver.execute('__shareSkins();');
            await measure('shared-skins-'+throttle+'x-'+i,seconds);
        }
    }
    await cdp('Emulation.setCPUThrottlingRate',{rate:1});
    const moved=await driver.execute(`
        const f=$gameFight,u=f.unit(__perfUnit),c=f.character(u),from={x:c.x,y:c.y};
        const cell=f.moveCells().filter(p=>!p.grapple&&Math.abs(p.x-c.x)+Math.abs(p.y-c.y)===1).sort((a,b)=>a.cost-b.cost)[0];
        if(!cell)return {error:'no neighboring move cell'};
        const accepted=f.commandMoveTo(cell.x,cell.y,cell.h,true);
        return {accepted,from,to:{x:cell.x,y:cell.y}};`);
    assert.equal(moved.accepted,true,JSON.stringify(moved));
    await driver.waitForScript(`const c=$gameFight.character($gameFight.unit(__perfUnit));return $gameFight._act?.stage==='command'&&!c.isMoving();`,[],{timeout:45000});
    const arrived=await driver.execute('const c=$gameFight.character($gameFight.unit(__perfUnit));return {x:c.x,y:c.y};');
    assert.deepEqual(arrived,moved.to,'unit finishes its requested move');
    assert.equal(await driver.execute('return $gameFight.commandEndTurn();'),true);
    const enemy=await measure('enemy-turn',Math.max(8,seconds));
    assert.ok(enemy.samples['ai.think'].n>0,'enemy turn actually runs AI');
    assert.equal(enemy.gl,0);
    assert.deepEqual(enemy.errors,[]);
    fs.writeFileSync(path.join(out,'movement.json'),JSON.stringify({moved,arrived},null,2));
    fs.writeFileSync(path.join(out,'logs.json'),JSON.stringify(await driver.sessionRequest('POST','/log',{type:'browser'}),null,2));
}finally{try{await driver.close();}finally{fs.rmSync(temp,{recursive:true,force:true});}}})().catch(e=>{console.error(e);process.exitCode=1;});
