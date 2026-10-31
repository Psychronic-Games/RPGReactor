#!/usr/bin/env node
/** North Haven shadow and occupied-interior checks on a disposable Demo.
 * Run through codex-check on an isolated display. --saved-auto recreates the
 * CPU-2 Auto graphics configuration; --pixels verifies character shadow pixels.
 * --battle checks selected-unit interior policy. The user's project is untouched.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/town-visibility-20261029/latest'));
const renderNode = option('render-node', '');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-town-visibility-'));
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
if (process.argv.includes('--saved-auto')) {
    // Reproduce the saved profile that hid North Haven's game shadows. Use a
    // fixture so this check also runs in a clean checkout without local saves.
    const config = { graphicsQuality: 'auto', graphicsAuto: { version: 2, gpu: 0, cpu: 2, half: false }, reactor3dSeen: true };
    const zip = require('node:zlib').deflateSync(JSON.stringify(config), { level: 1 }).toString('latin1');
    fs.mkdirSync(path.join(project, 'save'));
    fs.writeFileSync(path.join(project, 'save/config.rmmzsave'), zip, 'utf8');
}
const write = (n, data) => fs.writeFileSync(path.join(project, 'data', n), JSON.stringify(data));
const system = JSON.parse(fs.readFileSync(path.join(project, 'data/System.json')));
Object.assign(system, { startMapId: 5, startX: 80, startY: 58, rrSkipTitle: false });
write('System.json', system);
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const cdp = (cmd, params = {}) => driver.sessionRequest('POST', '/goog/cdp/execute', { cmd, params });
async function shadowPixels(label){
 const report=await driver.execute(`const ss=SceneManager._scene._spriteset,v=ss._reactor3d,R=Reactor3D,S=R.Shadows,renderer=v.viewport.renderer(),ticker=Graphics._app.ticker;
 const started=ticker.started,now=performance.now,date=Date.now,fixed=performance.now(),fixedDate=Date.now();ticker.stop();performance.now=()=>fixed;Date.now=()=>fixedDate;
 const roots=[...S._dynamic].filter(r=>r.parent),player=roots.find(r=>r.userData.reactorPlayer);
 const draw=()=>{for(let i=0;i<4;i++){v.viewport._matrixFrame=-1;ss.drawReactor3D(v);}const t=v.viewport.enlargedInComposite('below')?v.viewport._workTarget('below'):v.viewport._target('below'),b=new Uint8Array(t.width*t.height*4);renderer.readRenderTargetPixels(t,0,0,t.width,t.height,b);return{b,w:t.width,h:t.height};};
 const off=r=>{S._setCasts(r,false);S._dynamic.delete(r);S._casting.delete(r);};const on=r=>S.markCaster(r,true);
 const diff=(a,b)=>{let changed=0,max=0;for(let i=0;i<a.b.length;i+=4){const d=Math.max(Math.abs(a.b[i]-b.b[i]),Math.abs(a.b[i+1]-b.b[i+1]),Math.abs(a.b[i+2]-b.b[i+2]));if(d>4)changed++;max=Math.max(max,d);}return{changed,max};};
 try{const a=draw(),same=diff(a,draw());off(player);const withoutPlayer=diff(a,draw());on(player);for(const r of roots)off(r);const withoutAll=diff(a,draw());return{same,withoutPlayer,withoutAll,gl:renderer.getContext().getError()};}
 finally{for(const r of roots)on(r);performance.now=now;Date.now=date;if(started)ticker.start();}`);
 fs.writeFileSync(path.join(out,label+'-pixels.json'),JSON.stringify(report,null,2));console.log(label+'-pixels',JSON.stringify(report));assert.equal(report.gl,0);assert.ok(report.withoutPlayer.changed>50,'player shadow changes real pixels');assert.ok(report.same.changed<10,'frozen baseline stays stable');
}
async function snapshot(label){
 const report=await driver.execute(`const R=Reactor3D,S=R.Shadows,u=R.lightUniforms(),v=SceneManager._scene._spriteset._reactor3d;
 const roots=[...S._dynamic].filter(r=>r.parent).map(r=>({name:r.name,player:r.userData.reactorPlayer,visible:r.visible,casting:S._casting?.has(r),triangles:S._casterTriangles(r),position:r.matrixWorld.elements.slice(12,15),meshes:(()=>{let n=0,c=0;r.traverse(o=>{if(o.isMesh){n++;if(o.castShadow)c++;}});return[n,c];})()}));
 return{player:[$gamePlayer._realX,$gamePlayer._realY],gpu:Graphics.gpuDescription,tier:Graphics.gpuTier,quality:ConfigManager.graphicsQuality,auto:ConfigManager.graphicsAuto,cpu:R.Quality.c,profile:S.quality(),wanted:R.shadowsWanted($dataMap),active:S._active,budget:S.lastBudget,
 candidates:S._candidates.map(c=>({id:c.id,index:c.index,x:c.x,y:c.y,z:c.z,radius:c.radius,rank:c.rank})),statics:S._tiles.map(t=>({id:t.id,valid:t.valid,dirty:t.dirty})),dynamic:S._dynTiles.map(t=>({id:t.id,valid:t.valid,dirty:t.dirty,tile:t.tile})),
 sun:S._sun?.cascades.map(c=>({valid:c.valid,dynValid:c.dynValid,hasDyn:c.hasDyn,dirty:c.dirty})),sunInfo:Array.from(u.rrSunShadowInfo.value),shadowInfo:Array.from(u.rrShadowInfo.value),roots,
 cut:ReactorFight.View.openings(),trace:window.__visibilityGL||[],errors:__rrErrors,gl:v.viewport.renderer().getContext().getError()};`);
 report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
 console.log(label,JSON.stringify({player:report.player,gpu:report.gpu,budget:report.budget,casters:report.roots.filter(r=>r.casting).length,playerCaster:report.roots.filter(r=>r.player),sun:report.sun,errors:report.errors}));
 return report;
}
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.setScriptTimeout(90000);await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
 await driver.waitForScript('return !!window.$dataSystem&&DataManager.isDatabaseLoaded()&&ConfigManager.isLoaded()&&SceneManager._scene?.isStarted()&&!(SceneManager._scene instanceof Scene_Boot)&&!SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute(`window.__rrErrors=[];addEventListener('error',e=>__rrErrors.push(String(e.error?.stack||e.message)));SceneManager.isGameActive=()=>true;DataManager.setupNewGame();SceneManager.goto(Scene_Map);`);
 await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0&&[...v.scene._modelInstances.values()].some(h=>h.character===$gamePlayer&&h.object);`,[],{timeout:120000});
 if(process.argv.includes('--trace-gl'))await driver.execute(`window.__visibilityGL=[];        const renderer=SceneManager._scene._spriteset._reactor3d.viewport.renderer(),gl=renderer.getContext(),render=renderer.render;
        if(arguments[0]){const direct=renderer.renderBufferDirect;
            renderer.renderBufferDirect=function(camera,scene,geometry,material,object){const before=window.__townOwner;window.__townOwner={object:object.name,type:object.type,layers:object.layers.mask,depth:object.customDepthMaterial?.type,caster:object.customDepthMaterial?.__rrCaster,keys:Object.keys(object.userData||{}),parents:(()=>{const a=[];let p=object;for(let i=0;p&&i<5;i++,p=p.parent)a.push({name:p.name,type:p.type,keys:Object.keys(p.userData||{})});return a;})(),material:material.name,water:!!material.__reactorWater,reflect:material.userData?.rrWaterLook?.x,reflects:!!material.__reactorReflects,hook:String(material.onBeforeRender).slice(0,600),envIsTarget:renderer.properties.get(material).uniforms?.rrEnvMap?.value===this.getRenderTarget()?.texture};try{return direct.apply(this,arguments);}finally{window.__townOwner=before;}};
        }
        renderer.render=function(scene,camera){const prev=window.__townPass,target=this.getRenderTarget();
            window.__townPass={scene:scene.name,target:target?[target.width,target.height,target.texture?.name]:null,override:scene.overrideMaterial?.type};
            try{return render.apply(this,arguments);}finally{const error=gl.getError();if(error&&__visibilityGL.length<30)__visibilityGL.push({error,...window.__townPass,map:$gameMap.mapId(),x:$gamePlayer._realX,stack:String(new Error().stack)});window.__townPass=prev;}
        };
        if(arguments[0])for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const original=gl[name];gl[name]=function(){const result=original.apply(this,arguments),error=this.getError();if(error&&__visibilityGL.length<30){const attachments=[],samplers=[],program=this.getParameter(this.CURRENT_PROGRAM),active=this.getParameter(this.ACTIVE_TEXTURE);
            if(this.getParameter(this.DRAW_FRAMEBUFFER_BINDING))for(const attachment of [this.COLOR_ATTACHMENT0,this.DEPTH_ATTACHMENT,this.STENCIL_ATTACHMENT])if(this.getFramebufferAttachmentParameter(this.DRAW_FRAMEBUFFER,attachment,this.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)===this.TEXTURE)attachments.push({attachment,texture:this.getFramebufferAttachmentParameter(this.DRAW_FRAMEBUFFER,attachment,this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME)});
            const targets=new Map([[this.SAMPLER_2D,[this.TEXTURE_2D,this.TEXTURE_BINDING_2D]],[this.SAMPLER_2D_SHADOW,[this.TEXTURE_2D,this.TEXTURE_BINDING_2D]],[this.SAMPLER_CUBE,[this.TEXTURE_CUBE_MAP,this.TEXTURE_BINDING_CUBE_MAP]],[this.SAMPLER_3D,[this.TEXTURE_3D,this.TEXTURE_BINDING_3D]]]);
            if(program)for(let i=0;i<this.getProgramParameter(program,this.ACTIVE_UNIFORMS);i++){const uniform=this.getActiveUniform(program,i),binding=targets.get(uniform.type);if(!binding)continue;const value=this.getUniform(program,this.getUniformLocation(program,uniform.name));for(const unit of typeof value==='number'?[value]:value){this.activeTexture(this.TEXTURE0+unit);const texture=this.getParameter(binding[1]);const match=attachments.filter(a=>a.texture===texture).map(a=>a.attachment);if(match.length)samplers.push({name:uniform.name,unit,attachments:match});}}
            this.activeTexture(active);__visibilityGL.push({error,draw:name,...window.__townPass,owner:window.__townOwner,samplers,map:$gameMap.mapId(),x:$gamePlayer._realX,stack:String(new Error().stack)});
        }return result;};}`,[true]);
 for(const [i,x,y] of (process.argv.includes('--battle')?[[0,80,58]]:[[0,80,58],[1,86,59],[2,78,51],[3,95,68]])){
  await driver.execute('$gamePlayer.setThrough(true);$gamePlayer.locate(arguments[0],arguments[1]);',[x,y]);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1600);');
  const town=await snapshot('town-'+i);assert.equal(town.gl,0);assert.equal(town.errors.length,0);if(process.argv.includes('--saved-auto')){assert.equal(town.cpu,2);assert.equal(town.wanted,true);assert.equal(town.active,true);assert.equal(town.profile.dynamicTriangles,300000);}
  if(process.argv.includes('--pixels'))await shadowPixels('town-'+i);
 }
 if(process.argv.includes('--battle')){
  await driver.execute(`$gamePlayer.locate(80,58);$gameSwitches.setValue(1,true);$gameSwitches.setValue(4,true);$gameParty.addActor(9);$gameMap.requestRefresh();`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');
  await driver.execute(`const i=new Game_Interpreter(),a=$dataMap.events[12].pages[0].list.find(c=>c.code===357&&c.parameters[1]==='StartMapBattle').parameters;PluginManager.callCommand(i,a[0],a[1],{...a[3],wait:false});`);
  await driver.waitForScript(`return $gameFight._act?.player&&$gameFight._act.stage==='pick';`,[],{timeout:45000});
  assert.equal((await driver.execute('return ReactorFight.View.openings().buildings;')).length,0,'picking a unit reveals no interiors');
  await driver.execute(`const u=$gameFight.pendingUnits().find(u=>u.actorId===9);if(!u)throw Error('Rhea is not pending');$gameFight.commandSelectUnit(u.id);`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');
  await driver.execute(`const f=$gameFight,u=f.activeUnit(),b=f.battler(u),c=f.character(u),item=$dataArmors[114],slot=b.equipSlots().indexOf(item.etypeId);if(slot<0)throw Error('No grapple slot');b.forceChangeEquip(slot,item);window.__grappleProbes=[];
  for(const [x,y] of [[73,60],[73,50],[64,49],[64,72],[80,78],[91,89],[103,79],[78,99],[104,32],[42,94]]){
   c.locate(x,y);c._reactorGround=Reactor3D.groundHeightAt($dataMap,x+0.5,y+0.5,0);const cells=f.stopCells(u,f._act.steps,true);__grappleProbes.push({x,y,h:c._reactorGround,cells:cells.length});if(cells.length)break;
  }
  f.focusOn(c.x,c.y);if(!f.enterGrapple('move'))throw Error('No valid grapple fixture');f._tac.rev++;`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1000);');
  const grapple=await driver.execute(`const f=$gameFight,F=ReactorFight,R=Reactor3D,live=F.View.live(),c=f.character(f.activeUnit());f._act.grappleOnly=true;const cells=f.moveCells().filter(p=>p.grapple),points=[];let matched=null;
  for(const cell of cells.slice(0,32)){const p=R.projectToScreen(live.camera,cell.x+0.5,cell.h+0.02,cell.y+0.5);if(p.x<0||p.y<0||p.x>=Graphics.width||p.y>=Graphics.height){points.push({cell,screen:{x:p.x,y:p.y},outside:true});continue;}const hit=F.Input.pick(p.x,p.y);points.push({cell,screen:{x:p.x,y:p.y},hit:hit&&{x:hit.x,y:hit.y,h:hit.h}});if(hit&&hit.x===cell.x&&hit.y===cell.y&&Math.abs(hit.h-cell.h)<0.1){matched={cell,screen:{x:p.x,y:p.y},hit:{x:hit.x,y:hit.y,h:hit.h}};break;}}
  f._act.grappleOnly=false;return{points,probes:__grappleProbes,actor:f.battler(f.activeUnit()).name(),stage:f._act.stage,steps:f._act.steps,unit:f.activeUnit(),position:[c.x,c.y,c._realX,c._realY,c._reactorGround],equipment:f.battler(f.activeUnit()).equips().map(i=>i&&[i.id,i.name]),spec:F.grappleOf(f,f.activeUnit()),eligible:F.grappleFor(f,f.activeUnit()),accepted:F.grappleTargets(f,f.activeUnit(),c,F.Grid.heightOf(c),F.grappleFor(f,f.activeUnit())).map(t=>({x:t.x,y:t.y,h:t.to,cost:F.Grid.costAt(t.x,t.y,t.to),stop:F.Grid.canStopAt(t.x,t.y,t.to)})),bounds:F.Grid.reachedBounds(),physics:ReactorPhysics.grappleTargets($dataMap,c.x,c.y,F.Grid.heightOf(c),6,20).slice(0,20),candidates:cells.length,matched};`);
  fs.writeFileSync(path.join(out,'roof-grapple.json'),JSON.stringify(grapple,null,2));console.log('grapple',JSON.stringify(grapple));
  const outside=await snapshot('battle-move');assert.equal(outside.cut.buildings.length,0,'outdoor move marks leave houses closed');
  await driver.execute(`const f=$gameFight,c=f.character(f.activeUnit()),R=Reactor3D;c.locate(65,60);c._reactorGround=R.pieceBaseAt($dataMap,65,60)+0.1;f.focusOn(65,60);f._tac.rev++;`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1000);');
  const inside=await snapshot('battle-inside');assert.equal(inside.cut.buildings.length,1,'only occupied building opens');
  await driver.execute(`const f=$gameFight,c=f.character(f.activeUnit());c.locate(80,58);c._reactorGround=Reactor3D.pieceBaseAt($dataMap,80,58)+0.1;f.focusOn(80,58);Object.assign(f._tac.cursor,{on:true,x:65,y:60,h:16.1});f._tac.rev++;`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1000);');
  const roof=await snapshot('battle-roof-target');assert.equal(roof.cut.buildings.length,0,'roof cursor cannot hold an interior open after the actor leaves');
  assert.ok(grapple.matched,'a projected grapple roof edge must pick that same visible surface');
  for(const report of [outside,inside,roof]){assert.equal(report.gl,0);assert.equal(report.errors.length,0);assert.equal(report.trace.length,0);}

 }
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
